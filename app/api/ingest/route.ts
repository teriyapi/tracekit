import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";

const IngestSchema = z.object({
  agent: z.string(),
  source: z.enum(["live", "experiment"]),
  experiment_id: z.string().optional(),
  input: z.record(z.string(), z.unknown()),
  output: z.string(),
  model: z.string().optional(),
  latency_ms: z.number().optional(),
  cost_usd: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  // Auth: check ingest token
  const token = request.headers.get("x-tracekit-token");
  if (token !== process.env.TRACEKIT_INGEST_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate
  const result = IngestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const data = result.data;

  // Require experiment_id when source is 'experiment'
  if (data.source === "experiment" && !data.experiment_id) {
    return NextResponse.json(
      { error: "experiment_id is required when source is 'experiment'" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // Insert trace
  const { data: inserted, error: insertError } = await supabase
    .from("traces")
    .insert({
      agent: data.agent,
      source: data.source,
      experiment_id: data.experiment_id || null,
      input: data.input,
      output: data.output,
      model: data.model || null,
      latency_ms: data.latency_ms || null,
      cost_usd: data.cost_usd || null,
      metadata: data.metadata || {},
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to insert trace", detail: insertError.message },
      { status: 500 }
    );
  }

  // If experiment source, increment trace_count
  if (data.source === "experiment" && data.experiment_id) {
    await supabase.rpc("increment_trace_count", {
      exp_id: data.experiment_id,
    }).then(async (rpcResult) => {
      // Fallback: if RPC doesn't exist, do a manual increment
      if (rpcResult.error) {
        const { data: exp } = await supabase
          .from("experiments")
          .select("trace_count")
          .eq("id", data.experiment_id!)
          .single();
        if (exp) {
          await supabase
            .from("experiments")
            .update({ trace_count: exp.trace_count + 1 })
            .eq("id", data.experiment_id!);
        }
      }
    });
  }

  return NextResponse.json({ id: inserted.id });
}
