// OTel instrumentation TBD — see future layer

import type { TrackOptions, RunExperimentOptions } from "./types";

export type { TrackOptions, TrackResult, RunExperimentOptions } from "./types";

function getApiUrl(): string {
  return process.env.TRACEKIT_API_URL || "https://tracekit.vercel.app";
}

function getIngestToken(): string {
  return process.env.TRACEKIT_INGEST_TOKEN || "";
}

export async function track<T>(
  options: TrackOptions,
  fn: () => Promise<{ output: string; model?: string; cost_usd?: number; raw?: T }>
): Promise<{ id: string; output: string; raw?: T }> {
  const start = Date.now();
  let output: string;
  let model: string | undefined;
  let cost_usd: number | undefined;
  let raw: T | undefined;
  let metadata = options.metadata || {};

  try {
    const result = await fn();
    output = result.output;
    model = result.model;
    cost_usd = result.cost_usd;
    raw = result.raw;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    output = errorMessage;
    metadata = { ...metadata, error: true };

    const latency_ms = Date.now() - start;
    await postTrace({
      agent: options.agent,
      source: options.source || "live",
      experiment_id: options.experiment_id,
      input: options.input,
      output,
      model: options.model,
      latency_ms,
      cost_usd: undefined,
      metadata,
    });

    throw err;
  }

  const latency_ms = Date.now() - start;

  const { id } = await postTrace({
    agent: options.agent,
    source: options.source || "live",
    experiment_id: options.experiment_id,
    input: options.input,
    output,
    model: model || options.model,
    latency_ms,
    cost_usd,
    metadata,
  });

  return { id, output, raw };
}

async function postTrace(payload: Record<string, unknown>): Promise<{ id: string }> {
  const token = process.env.TRACEKIT_INGEST_TOKEN;
  if (!token) {
    console.warn("[tracekit] TRACEKIT_INGEST_TOKEN not set, skipping trace");
    return { id: "unsent" };
  }

  const url = `${getApiUrl()}/api/ingest`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tracekit-token": token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[tracekit] ingest failed (${res.status}): ${text}`);
      return { id: "unsent" };
    }

    return res.json();
  } catch (err) {
    console.warn("[tracekit] ingest unreachable:", (err as Error).message);
    return { id: "unsent" };
  }
}

async function createExperiment(
  name: string,
  agent: string,
  dataset: unknown[]
): Promise<string> {
  const url = `${getApiUrl()}/api/experiments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tracekit-token": getIngestToken(),
    },
    body: JSON.stringify({ name, agent, dataset }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create experiment (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.id;
}

async function completeExperiment(
  id: string,
  status: "completed" | "failed",
  error?: string
): Promise<void> {
  const url = `${getApiUrl()}/api/experiments/${id}/complete`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tracekit-token": getIngestToken(),
    },
    body: JSON.stringify({ status, error }),
  });
}

export async function runExperiment<TItem>(
  options: RunExperimentOptions<TItem>
): Promise<{ experiment_id: string; trace_ids: string[] }> {
  const { name, agent, dataset, run, inputMapper, existing_experiment_id } = options;
  const mapInput = inputMapper || ((item: TItem) => ({ item }));

  const experiment_id = existing_experiment_id || await createExperiment(name, agent, dataset);
  const trace_ids: string[] = [];

  try {
    // Sequential execution for v1
    for (const item of dataset) {
      const input = mapInput(item);
      const result = await track(
        { agent, input, source: "experiment", experiment_id },
        () => run(item)
      );
      trace_ids.push(result.id);
    }

    await completeExperiment(experiment_id, "completed");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await completeExperiment(experiment_id, "failed", errorMessage);
    throw err;
  }

  return { experiment_id, trace_ids };
}
