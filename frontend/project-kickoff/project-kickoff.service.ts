import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateKickoffRequest,
  Kickoff,
  KickoffOptions,
  KickoffSummary,
  MemberRequest,
  Person,
} from './project-kickoff.models';

/** A backend végpont. Ha a meglévő app más prefixet használ (pl. environment.apiUrl), itt felülírható. */
export const KICKOFF_API_URL = new InjectionToken<string>('KICKOFF_API_URL', {
  providedIn: 'root',
  factory: () => '/api/project-kickoffs',
});

@Injectable({ providedIn: 'root' })
export class ProjectKickoffService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(KICKOFF_API_URL);

  options(): Observable<KickoffOptions> {
    return this.http.get<KickoffOptions>(`${this.baseUrl}/options`);
  }

  searchPeople(query: string): Observable<Person[]> {
    return this.http.get<Person[]>(`${this.baseUrl}/people`, { params: new HttpParams().set('q', query) });
  }

  keyAvailability(key: string): Observable<{ projectKey: string; available: boolean }> {
    return this.http.get<{ projectKey: string; available: boolean }>(`${this.baseUrl}/key-availability`, {
      params: new HttpParams().set('key', key),
    });
  }

  list(): Observable<KickoffSummary[]> {
    return this.http.get<KickoffSummary[]>(this.baseUrl);
  }

  get(id: number): Observable<Kickoff> {
    return this.http.get<Kickoff>(`${this.baseUrl}/${id}`);
  }

  create(request: CreateKickoffRequest): Observable<Kickoff> {
    return this.http.post<Kickoff>(this.baseUrl, request);
  }

  retry(id: number): Observable<Kickoff> {
    return this.http.post<Kickoff>(`${this.baseUrl}/${id}/retry`, {});
  }

  addMembers(id: number, members: MemberRequest[]): Observable<Kickoff> {
    return this.http.post<Kickoff>(`${this.baseUrl}/${id}/members`, { members });
  }
}
