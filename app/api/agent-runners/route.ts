import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { getRole, isOwner } from "@/lib/auth";
import { toPublicRunner } from "@/lib/runners";
import type { AgentRunner } from "@/lib/db/types";

export async function GET() {
  const role = await getRole();
  if (!role) {
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

  return NextResponse.json(((data || []) as AgentRunner[]).map((r) => toPublicRunner(r, role)));
}

/** Upserts a runner. A field left out of the body keeps its stored value; null clears it. */
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

  const { agent, runner_url, runner_token } = body as {
    agent?: string;
    runner_url?: string | null;
    runner_token?: string | null;
  };

  if (!agent || typeof agent !== "string") {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  const row: Partial<AgentRunner> = { agent, updated_at: new Date().toISOString() };
  if (runner_url !== undefined) row.runner_url = runner_url || null;
  if (runner_token !== undefined) row.runner_token = runner_token || null;

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("agent_runners")
    .upsert(row, { onConflict: "agent" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(toPublicRunner(data as AgentRunner, "owner"));
}
