import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

/**
 * POST /api/experiments/[id]/run
 * Dispatches the experiment to the agent runner synchronously.
 * Called from the client after /start returns the experiment ID.
 * The client's fetch keeps the connection alive for the full duration.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServerSupabase();

  // Load experiment
  const { data: experiment } = await supabase
    .from("experiments")
    .select("*")
    .eq("id", id)
    .single();

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  // Load runner
  const { data: runner } = await supabase
    .from("agent_runners")
    .select("*")
    .eq("agent", experiment.agent)
    .single();

  if (!runner?.runner_url) {
    return NextResponse.json({ error: "no_runner_configured" }, { status: 400 });
  }

  const callbackToken = process.env.TRACEKIT_INGEST_TOKEN!;

  try {
    const res = await fetch(runner.runner_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runner.runner_token || ""}`,
      },
      body: JSON.stringify({
        experiment_id: id,
        name: experiment.name,
        dataset: experiment.dataset,
        callback_token: callbackToken,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      await supabase
        .from("experiments")
        .update({ status: "failed", error: `Runner returned ${res.status}: ${text}` })
        .eq("id", id);
      return NextResponse.json({ error: `Runner failed (${res.status})` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("experiments")
      .update({ status: "failed", error: `Runner connection failed: ${message}` })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
