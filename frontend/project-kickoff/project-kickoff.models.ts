export type StepType = 'GITLAB' | 'MATTERMOST' | 'DRIVE' | 'BOOKSTACK' | 'SYNCRO';
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'WARNING' | 'FAILED' | 'SKIPPED';
export type KickoffStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
export type MemberRole = 'PROJECT_MANAGER' | 'MEMBER' | 'VIEWER';

export interface IntegrationOption {
  type: StepType;
  label: string;
}

export interface KickoffOptions {
  integrations: IntegrationOption[];
  keyPattern: string;
}

export interface Person {
  email: string;
  displayName: string;
}

export interface MemberRequest {
  email: string;
  role: Exclude<MemberRole, 'PROJECT_MANAGER'>;
}

export interface CreateKickoffRequest {
  name: string;
  projectKey: string;
  description: string | null;
  projectManagerEmail: string;
  members: MemberRequest[];
  integrations: StepType[];
  privateChannel: boolean;
}

export interface KickoffStep {
  id: number;
  type: StepType;
  label: string;
  status: StepStatus;
  externalId: string | null;
  url: string | null;
  message: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Kickoff {
  id: number;
  projectKey: string;
  name: string;
  description: string | null;
  projectManagerEmail: string;
  privateChannel: boolean;
  status: KickoffStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  members: { email: string; role: MemberRole }[];
  steps: KickoffStep[];
}

export interface KickoffSummary {
  id: number;
  projectKey: string;
  name: string;
  projectManagerEmail: string;
  status: KickoffStatus;
  createdAt: string;
}

export interface ApiError {
  message: string;
  details: string[];
}

export const KICKOFF_STATUS_LABELS: Record<KickoffStatus, string> = {
  PENDING: 'Várakozik',
  RUNNING: 'Folyamatban',
  COMPLETED: 'Kész',
  COMPLETED_WITH_WARNINGS: 'Kész, figyelmeztetésekkel',
  FAILED: 'Hiba',
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  PENDING: 'Várakozik',
  RUNNING: 'Fut…',
  SUCCESS: 'Kész',
  WARNING: 'Kész, figyelmeztetéssel',
  FAILED: 'Hiba',
  SKIPPED: 'Kihagyva',
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  PROJECT_MANAGER: 'Projektvezető',
  MEMBER: 'Tag',
  VIEWER: 'Megtekintő',
};

export function isRunning(status: KickoffStatus): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

/** A backend Slugs.toSlug megfelelője: "Új Ügyfélportál 2.0" -> "uj-ugyfelportal-2-0" */
export function toSlug(text: string): string {
  let s = (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 50) {
    s = s.substring(0, 50).replace(/-+$/, '');
  }
  return s;
}
