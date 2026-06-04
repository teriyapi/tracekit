export type TrackOptions = {
  agent: string;
  input: Record<string, unknown>;
  source?: "live" | "experiment";
  experiment_id?: string;
  model?: string;
  metadata?: Record<string, unknown>;
};

export type TrackResult = { id: string };

export type RunExperimentOptions<TItem> = {
  name: string;
  agent: string;
  dataset: TItem[];
  run: (item: TItem) => Promise<{ output: string; model?: string; cost_usd?: number }>;
  inputMapper?: (item: TItem) => Record<string, unknown>;
  existing_experiment_id?: string;
};
