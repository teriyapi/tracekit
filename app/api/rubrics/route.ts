import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated, isOwner } from "@/lib/auth";

const CriterionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  polarity: z.enum(["do", "avoid"]),
  evidence: z.array(z.string()),
});

const SaveRubricSchema = z.object({
  agent: z.string().min(1),
  criteria: z.array(CriterionSchema).min(1),
  train_trace_ids: z.array(z.uuid()),
});

export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = new URL(request.url).searchParams.get("agent");
  if (!agent) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("rubrics")
    .select("*")
    .eq("agent", agent)
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/** Saves the criteria as the agent's next version. */
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

  const result = SaveRubricSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", issues: result.error.issues }, { status: 400 });
  }

  const { agent, criteria, train_trace_ids } = result.data;
  const supabase = getServerSupabase();

  const { data: latest, error: latestError } = await supabase
    .from("rubrics")
    .select("version")
    .eq("agent", agent)
    .order("version", { ascending: false })
    .limit(1);

  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }

  const version = (latest?.[0]?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("rubrics")
    .insert({ agent, version, criteria, train_trace_ids })
    .select()
    .single();

  if (error) {
    // unique(agent, version): someone saved in between
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
