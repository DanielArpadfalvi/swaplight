import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KICKOFF_STATUS_LABELS, KickoffSummary } from './project-kickoff.models';
import { ProjectKickoffService } from './project-kickoff.service';

@Component({
  selector: 'app-project-kickoff-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="kickoff">
      <header class="kickoff__header">
        <h1>Projektindítások</h1>
        <a class="kickoff__btn" routerLink="uj">+ Új projekt indítása</a>
      </header>

      @if (error()) {
        <div class="kickoff__alert kickoff__alert--error">{{ error() }}</div>
      }

      <table class="kickoff__steps">
        <thead>
          <tr>
            <th>Projekt</th>
            <th>Kulcs</th>
            <th>Projektvezető</th>
            <th>Állapot</th>
            <th>Indítva</th>
          </tr>
        </thead>
        <tbody>
          @for (k of items(); track k.id) {
            <tr>
              <td><a [routerLink]="[k.id]">{{ k.name }}</a></td>
              <td><code>{{ k.projectKey }}</code></td>
              <td>{{ k.projectManagerEmail }}</td>
              <td><span class="kickoff__badge" [attr.data-status]="k.status">{{ statusLabels[k.status] }}</span></td>
              <td>{{ k.createdAt | date: 'yyyy.MM.dd. HH:mm' }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">Még nem indult projekt ezen a felületen.</td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
  styleUrl: './project-kickoff.scss',
})
export class ProjectKickoffListComponent implements OnInit {
  private readonly api = inject(ProjectKickoffService);

  readonly statusLabels = KICKOFF_STATUS_LABELS;
  readonly items = signal<KickoffSummary[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.list().subscribe({
      next: (items) => this.items.set(items),
      error: () => this.error.set('Nem sikerült betölteni a listát.'),
    });
  }
}
