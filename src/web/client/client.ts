/**
 * Typed fetch client for the local API.
 */
import type {
  Dashboard,
  DayOverrideInput,
  DayView,
  ManualTaskInput,
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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Cannot reach the local server. Is it running on 127.0.0.1:4545?', 0);
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
    const obj = (data ?? {}) as { error?: string; details?: ApiIssue[] };
    throw new ApiError(obj.error ?? `Request failed (${res.status})`, res.status, Array.isArray(obj.details) ? obj.details : []);
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
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
