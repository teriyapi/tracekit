export type Trace = {
  id: string;
  agent: string;
  source: "live" | "experiment";
  experiment_id: string | null;
  input: Record<string, unknown>;
  output: string;
  model: string | null;
  latency_ms: number | null;
  cost_usd: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Experiment = {
  id: string;
  name: string;
  agent: string;
  status: "pending" | "running" | "completed" | "failed";
  dataset: unknown[];
  trace_count: number;
  avg_rating: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type Annotation = {
  id: string;
  trace_id: string;
  rating: number | null;
  reason: string | null;
  tags: string[];
  created_at: string;
};

export type Tag = {
  name: string;
  description: string | null;
  created_at: string;
};

export type AgentRunner = {
  agent: string;
  runner_url: string | null;
  runner_token: string | null;
  updated_at: string;
};

export type TraceWithLatestAnnotation = Trace & {
  latest_rating: number | null;
  latest_reason: string | null;
  latest_tags: string[] | null;
  latest_annotation_at: string | null;
};

export type ExperimentWithStats = Experiment & {
  computed_avg_rating: number | null;
};
