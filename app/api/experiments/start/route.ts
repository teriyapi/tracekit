import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, agent, dataset } = body as {
    name?: string;
    agent?: string;
    dataset?: unknown[];
  };

  if (!name || !agent || !dataset || !Array.isArray(dataset)) {
    return NextResponse.json({ error: "name, agent, and dataset are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Look up runner
  const { data: runner } = await supabase
    .from("agent_runners")
    .select("*")
    .eq("agent", agent)
    .single();

  if (!runner?.runner_url) {
    return NextResponse.json({ error: "no_runner_configured" }, { status: 400 });
  }

  // Create experiment row
  const { data: experiment, error: expError } = await supabase
    .from("experiments")
    .insert({
      name,
      agent,
      dataset,
      status: "running",
      trace_count: 0,
    })
    .select("id")
    .single();

  if (expError || !experiment) {
    return NextResponse.json(
      { error: "Failed to create experiment", detail: expError?.message },
      { status: 500 }
    );
  }

  // Return immediately — the client will call /api/experiments/[id]/run to dispatch the runner.
  return NextResponse.json({ experiment_id: experiment.id });
}
