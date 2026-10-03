/**
 * Typed fetch client for the local API.
 */
import type {
  CatalogResponse,
  Dashboard,
  DayOverrideInput,
  DayView,
  HealthResponse,
  IdReuse,
  ImportMode,
  ImportPreview,
  ImportResult,
  ManualTaskInput,
  PlanPack,
  PlanPromptResponse,
  QuranResponse,
  ResourcesResponse,
  ScorePreview,
  Settings,
  SettingsSaveResponse,
  StatsResponse,
  TaskView,
  TracksResponse,
  WeekResponse,
} from './types';

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: ApiIssue[] = [],
    /** Raw `details` payload as returned (not always an array). */
    readonly rawDetails?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Client-generated error copy is localized; server error messages are not.
// LocaleProvider calls this whenever the UI language changes.
let errLang: 'en' | 'ar' = 'en';
export function setClientLang(lang: 'en' | 'ar'): void {
  errLang = lang;
}
const UNREACHABLE = { en: 'Cannot reach the local server. Is it running on 127.0.0.1:4545?', ar: 'تعذّر الوصول إلى الخادم المحلي. هل يعمل على 127.0.0.1:4545؟' };
const GENERIC = { en: 'Something went wrong', ar: 'حدث خطأ ما' };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(UNREACHABLE[errLang], 0);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; details?: unknown };
    throw new ApiError(obj.error ?? `Request failed (${res.status})`, res.status, Array.isArray(obj.details) ? (obj.details as ApiIssue[]) : [], obj.details);
  }
  return data as T;
}

export const api = {
  dashboard: (date?: string) => request<Dashboard>('GET', `/dashboard${date ? `?date=${date}` : ''}`),
  week: (start: string) => request<WeekResponse>('GET', `/week?start=${start}`),
  regenerate: (from?: string) =>
    request<{ from: string; to: string; deleted: number; created: number }>('POST', '/plan/regenerate', from ? { from } : {}),
  scorePreview: (input: ManualTaskInput) => request<ScorePreview>('POST', '/tasks/score-preview', input),
  createTask: (input: ManualTaskInput) => request<TaskView>('POST', '/tasks', input),
  complete: (id: number, actualMinutes?: number | null) =>
    request<TaskView>('POST', `/tasks/${id}/complete`, actualMinutes ? { actualMinutes } : {}),
  uncomplete: (id: number) => request<TaskView>('POST', `/tasks/${id}/uncomplete`, {}),
  skip: (id: number) => request<TaskView>('POST', `/tasks/${id}/skip`, {}),
  deleteTask: (id: number) => request<{ ok: true }>('DELETE', `/tasks/${id}`),
  tracks: () => request<TracksResponse>('GET', '/tracks'),
  completeModule: (id: string) => request<TracksResponse>('POST', `/modules/${encodeURIComponent(id)}/complete`, {}),
  resetModule: (id: string) => request<TracksResponse>('POST', `/modules/${encodeURIComponent(id)}/reset`, {}),
  quran: () => request<QuranResponse>('GET', '/quran'),
  stats: () => request<StatsResponse>('GET', '/stats'),
  resources: () => request<ResourcesResponse>('GET', '/resources'),
  settings: () => request<Settings>('GET', '/settings'),
  saveSettings: (patch: Partial<Settings>) => request<SettingsSaveResponse>('PUT', '/settings', patch),
  day: (date: string) => request<DayView>('GET', `/days/${date}`),
  saveDay: (date: string, body: DayOverrideInput) => request<DayView>('PUT', `/days/${date}`, body),
  catalog: () => request<CatalogResponse>('GET', '/catalog'),
  health: () => request<HealthResponse>('GET', '/health'),
  planPack: () => request<PlanPack>('GET', '/plan-pack'),
  planPrompt: () => request<PlanPromptResponse>('GET', '/plan-prompt'),
  importPreview: (pack: unknown, mode: ImportMode) => request<ImportPreview>('POST', '/import/preview', { pack, mode }),
  importCommit: (pack: unknown, mode: ImportMode, onIdReuse?: IdReuse) =>
    request<ImportResult>('POST', '/import', { pack, mode, ...(onIdReuse ? { onIdReuse } : {}) }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return GENERIC[errLang];
}
