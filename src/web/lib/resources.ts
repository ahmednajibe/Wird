import { useMemo } from 'react';
import { useResources } from '../client/hooks';
import type { ResourceView } from '../client/types';

const EMPTY: ResourceView[] = [];

/** Resources per curriculum module id (for task detail links). */
export function useModuleResources(): (moduleId: string | null) => ResourceView[] {
  const { data } = useResources();
  const map = useMemo(() => new Map((data?.modules ?? []).map((m) => [m.id, m.resources])), [data]);
  return (moduleId) => (moduleId ? (map.get(moduleId) ?? EMPTY) : EMPTY);
}
