import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, Observable, of, switchMap, timer } from 'rxjs';
import { ApiError, IntegrationOption, StepType, toSlug } from './project-kickoff.models';
import { ProjectKickoffService } from './project-kickoff.service';
import { addPastedMembers, MemberFormGroup, memberGroup, PeopleSearch, toMemberRequests } from './people-search';

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

@Component({
  selector: 'app-project-kickoff-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  providers: [PeopleSearch],
  templateUrl: './project-kickoff-form.component.html',
  styleUrl: './project-kickoff.scss',
})
export class ProjectKickoffFormComponent implements OnInit {
  private readonly api = inject(ProjectKickoffService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly people = inject(PeopleSearch);

  readonly integrations = signal<IntegrationOption[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<ApiError | null>(null);
  readonly submitting = signal(false);

  /** Amíg a felhasználó nem írja át kézzel, a kulcs a névből generálódik. */
  private keyTouchedManually = false;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    projectKey: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(KEY_PATTERN)],
      asyncValidators: [this.keyAvailableValidator()],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    projectManagerEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    members: new FormArray<MemberFormGroup>([]),
    integrations: new FormGroup<Partial<Record<StepType, FormControl<boolean>>>>({}),
    privateChannel: new FormControl(true, { nonNullable: true }),
  });

  readonly pasteBox = new FormControl('', { nonNullable: true });

  get members(): FormArray<MemberFormGroup> {
    return this.form.controls.members;
  }

  ngOnInit(): void {
    this.api.options().subscribe({
      next: (options) => {
        this.integrations.set(options.integrations);
        for (const option of options.integrations) {
          this.form.controls.integrations.addControl(option.type, new FormControl(true, { nonNullable: true }));
        }
      },
      error: () => this.loadError.set('Nem sikerült betölteni a beállításokat.'),
    });

    this.form.controls.name.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((name) => {
      if (!this.keyTouchedManually) {
        this.form.controls.projectKey.setValue(toSlug(name));
        this.form.controls.projectKey.markAsTouched();
      }
    });
  }

  onKeyInput(): void {
    this.keyTouchedManually = true;
  }

  isEnabled(type: StepType): boolean {
    return this.form.controls.integrations.controls[type]?.value === true;
  }

  addMember(): void {
    this.members.push(memberGroup());
  }

  removeMember(index: number): void {
    this.members.removeAt(index);
  }

  addPasted(): void {
    addPastedMembers(this.members, this.pasteBox.value);
    this.pasteBox.setValue('');
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.form.pending || this.submitting()) {
      return;
    }
    const value = this.form.getRawValue();
    const selected = this.integrations()
      .map((o) => o.type)
      .filter((t) => value.integrations[t]);
    if (selected.length === 0) {
      this.submitError.set({ message: 'Legalább egy rendszert ki kell választani.', details: [] });
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.api
      .create({
        name: value.name.trim(),
        projectKey: value.projectKey,
        description: value.description.trim() || null,
        projectManagerEmail: value.projectManagerEmail.trim(),
        members: toMemberRequests(this.members),
        integrations: selected,
        privateChannel: value.privateChannel,
      })
      .subscribe({
        next: (kickoff) => this.router.navigate(['..', kickoff.id], { relativeTo: this.route }),
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.submitError.set(err.error?.message ? err.error : { message: 'Váratlan hiba történt.', details: [] });
        },
      });
  }

  private keyAvailableValidator(): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      const key = control.value as string;
      if (!key || !KEY_PATTERN.test(key)) {
        return of(null);
      }
      return timer(300).pipe(
        switchMap(() => this.api.keyAvailability(key)),
        map((r) => (r.available ? null : { keyTaken: true })),
        catchError(() => of(null)),
      );
    };
  }
}
