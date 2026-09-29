/**
 * React Query hooks. Every mutation invalidates all queries afterwards: this is
 * a single-user local app, so refetching everything is cheap and always correct.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { DayOverrideInput, IdReuse, ImportMode, ManualTaskInput, Settings } from './types';

export const qk = {
  dashboard: ['dashboard'] as const,
  week: (start: string) => ['week', start] as const,
  tracks: ['tracks'] as const,
  quran: ['quran'] as const,
  stats: ['stats'] as const,
  resources: ['resources'] as const,
  settings: ['settings'] as const,
  catalog: ['catalog'] as const,
  health: ['health'] as const,
  preview: (input: ManualTaskInput) => ['score-preview', input] as const,
};

export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => api.dashboard() });
export const useWeek = (start: string) =>
  useQuery({ queryKey: qk.week(start), queryFn: () => api.week(start), placeholderData: keepPreviousData });
export const useTracks = () => useQuery({ queryKey: qk.tracks, queryFn: api.tracks });
export const useQuran = () => useQuery({ queryKey: qk.quran, queryFn: api.quran });
export const useStats = () => useQuery({ queryKey: qk.stats, queryFn: api.stats });
export const useResources = () => useQuery({ queryKey: qk.resources, queryFn: api.resources, staleTime: 60_000 });
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings });
export const useCatalog = () => useQuery({ queryKey: qk.catalog, queryFn: api.catalog, staleTime: 60_000 });
export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: api.health, staleTime: Infinity });

export function useScorePreview(input: ManualTaskInput | null) {
  return useQuery({
    queryKey: input ? qk.preview(input) : ['score-preview', 'none'],
    queryFn: () => api.scorePreview(input as ManualTaskInput),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useCreateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: ManualTaskInput) => api.createTask(input), onSettled: invalidate });
}

export function useRegenerate() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (from?: string) => api.regenerate(from), onSettled: invalidate });
}

export function useSaveDay() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: DayOverrideInput }) => api.saveDay(date, body),
    onSettled: invalidate,
  });
}

export function useModuleAction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'complete' | 'reset' }) =>
      action === 'complete' ? api.completeModule(id) : api.resetModule(id),
    onSettled: invalidate,
  });
}

export function useSaveSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (patch: Partial<Settings>) => api.saveSettings(patch), onSettled: invalidate });
}

export function useCommitImport() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ pack, mode, onIdReuse }: { pack: unknown; mode: ImportMode; onIdReuse?: IdReuse }) =>
      api.importCommit(pack, mode, onIdReuse),
    onSettled: invalidate,
  });
}
