import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("agent_runners")
    .select("*")
    .order("agent");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

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

  const { agent, runner_url, runner_token } = body as {
    agent?: string;
    runner_url?: string;
    runner_token?: string;
  };

  if (!agent || typeof agent !== "string") {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("agent_runners")
    .upsert(
      {
        agent,
        runner_url: runner_url || null,
        runner_token: runner_token || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
