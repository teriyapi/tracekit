type TrackOptions = {
    agent: string;
    input: Record<string, unknown>;
    source?: "live" | "experiment";
    experiment_id?: string;
    model?: string;
    metadata?: Record<string, unknown>;
};
type TrackResult = {
    id: string;
};
type RunExperimentOptions<TItem> = {
    name: string;
    agent: string;
    dataset: TItem[];
    run: (item: TItem) => Promise<{
        output: string;
        model?: string;
        cost_usd?: number;
    }>;
    inputMapper?: (item: TItem) => Record<string, unknown>;
    existing_experiment_id?: string;
};

declare function track<T>(options: TrackOptions, fn: () => Promise<{
    output: string;
    model?: string;
    cost_usd?: number;
    raw?: T;
}>): Promise<{
    id: string;
    output: string;
    raw?: T;
}>;
declare function runExperiment<TItem>(options: RunExperimentOptions<TItem>): Promise<{
    experiment_id: string;
    trace_ids: string[];
}>;

export { type RunExperimentOptions, type TrackOptions, type TrackResult, runExperiment, track };
