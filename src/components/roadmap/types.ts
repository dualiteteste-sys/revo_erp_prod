import type { SupabaseClient } from '@supabase/supabase-js';

export type RoadmapGroupKey = 'industria' | 'servicos' | 'comercio';

export type RoadmapStepStatus = 'done' | 'todo' | 'unknown';

export type RoadmapStep = {
  key: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  check: (supabase: SupabaseClient) => Promise<boolean>;
};

export type RoadmapGroup = {
  key: RoadmapGroupKey;
  title: string;
  subtitle: string;
  steps: RoadmapStep[];
};

