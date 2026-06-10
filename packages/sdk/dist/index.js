"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.ts
var index_exports = {};
__export(index_exports, {
  runExperiment: () => runExperiment,
  track: () => track
});
module.exports = __toCommonJS(index_exports);
function getApiUrl() {
  return process.env.TRACEKIT_API_URL || "https://tracekit.vercel.app";
}
function getIngestToken() {
  return process.env.TRACEKIT_INGEST_TOKEN || "";
}
async function track(options, fn) {
  const start = Date.now();
  let output;
  let model;
  let cost_usd;
  let raw;
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
    const latency_ms2 = Date.now() - start;
    await postTrace({
      agent: options.agent,
      source: options.source || "live",
      experiment_id: options.experiment_id,
      input: options.input,
      output,
      model: options.model,
      latency_ms: latency_ms2,
      cost_usd: void 0,
      metadata
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
    metadata
  });
  return { id, output, raw };
}
async function postTrace(payload) {
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
        "x-tracekit-token": token
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[tracekit] ingest failed (${res.status}): ${text}`);
      return { id: "unsent" };
    }
    return res.json();
  } catch (err) {
    console.warn("[tracekit] ingest unreachable:", err.message);
    return { id: "unsent" };
  }
}
async function createExperiment(name, agent, dataset) {
  const url = `${getApiUrl()}/api/experiments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tracekit-token": getIngestToken()
    },
    body: JSON.stringify({ name, agent, dataset })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create experiment (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.id;
}
async function completeExperiment(id, status, error) {
  const url = `${getApiUrl()}/api/experiments/${id}/complete`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tracekit-token": getIngestToken()
    },
    body: JSON.stringify({ status, error })
  });
}
async function runExperiment(options) {
  const { name, agent, dataset, run, inputMapper, existing_experiment_id } = options;
  const mapInput = inputMapper || ((item) => ({ item }));
  const experiment_id = existing_experiment_id || await createExperiment(name, agent, dataset);
  const trace_ids = [];
  try {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runExperiment,
  track
});
