import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, EMPTY, Subject, switchMap, takeWhile, timer } from 'rxjs';
import {
  isRunning,
  Kickoff,
  KICKOFF_STATUS_LABELS,
  ROLE_LABELS,
  STEP_STATUS_LABELS,
} from './project-kickoff.models';
import { ProjectKickoffService } from './project-kickoff.service';
import { addPastedMembers, MemberFormGroup, memberGroup, PeopleSearch, toMemberRequests } from './people-search';

const POLL_INTERVAL_MS = 2000;

@Component({
  selector: 'app-project-kickoff-status',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  providers: [PeopleSearch],
  templateUrl: './project-kickoff-status.component.html',
  styleUrl: './project-kickoff.scss',
})
export class ProjectKickoffStatusComponent implements OnInit {
  private readonly api = inject(ProjectKickoffService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly people = inject(PeopleSearch);

  readonly statusLabels = KICKOFF_STATUS_LABELS;
  readonly stepLabels = STEP_STATUS_LABELS;
  readonly roleLabels = ROLE_LABELS;

  readonly kickoff = signal<Kickoff | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly running = computed(() => {
    const k = this.kickoff();
    return k !== null && isRunning(k.status);
  });
  readonly canRetry = computed(() => {
    const k = this.kickoff();
    return k !== null && (k.status === 'FAILED' || k.status === 'COMPLETED_WITH_WARNINGS');
  });

  readonly newMembers = new FormArray<MemberFormGroup>([]);
  readonly pasteBox = new FormControl('', { nonNullable: true });

  private readonly startPolling$ = new Subject<number>();
  private id = 0;

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));

    // Addig kérdezi le az állapotot, amíg fut (az utolsó, befejezett állapotot még megjeleníti).
    this.startPolling$
      .pipe(
        switchMap(() =>
          timer(0, POLL_INTERVAL_MS).pipe(
            // Egy sikertelen lekérdezés (pl. hálózati hiba) nem állítja le a frissítést.
            switchMap(() =>
              this.api.get(this.id).pipe(
                catchError((err: HttpErrorResponse) => {
                  this.error.set(this.describe(err));
                  return EMPTY;
                }),
              ),
            ),
            takeWhile((k) => isRunning(k.status), true),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((k) => {
        this.kickoff.set(k);
        this.error.set(null);
      });

    this.startPolling$.next(this.id);
  }

  retry(): void {
    this.run(this.api.retry(this.id));
  }

  addMemberRow(): void {
    this.newMembers.push(memberGroup());
  }

  removeMemberRow(index: number): void {
    this.newMembers.removeAt(index);
  }

  addPasted(): void {
    addPastedMembers(this.newMembers, this.pasteBox.value);
    this.pasteBox.setValue('');
  }

  submitMembers(): void {
    this.newMembers.markAllAsTouched();
    const members = toMemberRequests(this.newMembers);
    if (this.newMembers.invalid || members.length === 0) {
      return;
    }
    this.run(this.api.addMembers(this.id, members), () => this.newMembers.clear());
  }

  private run(request: ReturnType<ProjectKickoffService['retry']>, onSuccess?: () => void): void {
    this.busy.set(true);
    request.subscribe({
      next: (k) => {
        this.busy.set(false);
        this.kickoff.set(k);
        onSuccess?.();
        this.startPolling$.next(this.id);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  private describe(err: HttpErrorResponse): string {
    const body = err.error as { message?: string; details?: string[] } | null;
    if (body?.message) {
      return body.details?.length ? `${body.message}: ${body.details.join(', ')}` : body.message;
    }
    return err.status === 404 ? 'Nincs ilyen projektindítás.' : 'Nem sikerült lekérdezni az állapotot.';
  }
}
