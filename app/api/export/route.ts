import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isOwner } from "@/lib/auth";

export async function POST(request: Request) {
  const authed = await isOwner();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { trace_ids, task } = body as { trace_ids?: string[]; task?: string };

  if (!trace_ids || !Array.isArray(trace_ids) || trace_ids.length === 0) {
    return NextResponse.json({ error: "trace_ids is required" }, { status: 400 });
  }
  if (typeof task !== "string") {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  const { data: traces, error } = await supabase
    .from("traces_with_latest_annotation")
    .select("*")
    .in("id", trace_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const exportedTraces = (traces || []).map((t) => ({
    id: t.id,
    agent: t.agent,
    input: t.input,
    output: t.output,
    model: t.model,
    latency_ms: t.latency_ms,
    cost_usd: t.cost_usd,
    metadata: t.metadata || {},
    annotation: t.latest_rating != null || t.latest_reason != null || (t.latest_tags && t.latest_tags.length > 0)
      ? {
          rating: t.latest_rating,
          reason: t.latest_reason,
          tags: t.latest_tags || [],
        }
      : null,
  }));

  const envelope = {
    exported_at: new Date().toISOString(),
    tracekit_version: "0.1.0",
    task,
    count: exportedTraces.length,
    traces: exportedTraces,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const filename = `tracekit-export-${timestamp}.json`;

  return new NextResponse(JSON.stringify(envelope, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
