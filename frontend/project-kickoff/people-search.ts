import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, Subject, switchMap } from 'rxjs';
import { MemberRequest, Person } from './project-kickoff.models';
import { ProjectKickoffService } from './project-kickoff.service';

/**
 * Személykereső javaslatok egy <datalist>-hez. Komponens szinten kell providolni:
 * providers: [PeopleSearch]
 */
@Injectable()
export class PeopleSearch {
  private readonly api = inject(ProjectKickoffService);
  private readonly terms = new Subject<string>();

  readonly suggestions = signal<Person[]>([]);

  constructor() {
    this.terms
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => (term.length < 2 ? of([]) : this.api.searchPeople(term).pipe(catchError(() => of([]))))),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((people) => this.suggestions.set(people));
  }

  search(term: string): void {
    this.terms.next((term ?? '').trim());
  }
}

export type MemberFormGroup = FormGroup<{
  email: FormControl<string>;
  role: FormControl<MemberRequest['role']>;
}>;

export function memberGroup(email = '', role: MemberRequest['role'] = 'MEMBER'): MemberFormGroup {
  return new FormGroup({
    email: new FormControl(email, { nonNullable: true, validators: [Validators.required, Validators.email] }),
    role: new FormControl<MemberRequest['role']>(role, { nonNullable: true }),
  });
}

/** Vesszővel, pontosvesszővel, szóközzel vagy sortöréssel elválasztott e-mail címek hozzáadása. */
export function addPastedMembers(members: FormArray<MemberFormGroup>, text: string): number {
  const existing = new Set(members.controls.map((c) => c.controls.email.value.trim().toLowerCase()));
  const emails = (text ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^<|>$/g, ''))
    .filter((e) => e.includes('@'));
  let added = 0;
  for (const email of emails) {
    if (!existing.has(email.toLowerCase())) {
      existing.add(email.toLowerCase());
      members.push(memberGroup(email));
      added++;
    }
  }
  return added;
}

export function toMemberRequests(members: FormArray<MemberFormGroup>): MemberRequest[] {
  return members.controls
    .map((c) => ({ email: c.controls.email.value.trim(), role: c.controls.role.value }))
    .filter((m) => m.email.length > 0);
}
