import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";
import { extractExchange } from "@/lib/conversation";
import { judgeExchange } from "@/lib/taste/llm";
import type { Rubric, Trace } from "@/lib/db/types";

export const maxDuration = 60;

const ScoreSchema = z.object({
  rubric_id: z.uuid(),
  trace_id: z.uuid(),
});

/** Scores ONE trace against one rubric version. The client loops with bounded concurrency. */
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

  const result = ScoreSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", issues: result.error.issues }, { status: 400 });
  }

  const { rubric_id, trace_id } = result.data;
  const supabase = getServerSupabase();

  const [{ data: rubric }, { data: trace }] = await Promise.all([
    supabase.from("rubrics").select("*").eq("id", rubric_id).single(),
    // Only the conversation: the judge must not see my verdict or note
    supabase.from("traces").select("id, input, output").eq("id", trace_id).single(),
  ]);

  if (!rubric) {
    return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
  }
  if (!trace) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 });
  }

  let judged;
  try {
    judged = await judgeExchange((rubric as Rubric).criteria, extractExchange(trace as Pick<Trace, "input" | "output">));
  } catch (err) {
    return NextResponse.json({ error: `Judge failed: ${(err as Error).message}` }, { status: 502 });
  }

  const { data, error } = await supabase
    .from("judge_scores")
    .upsert({ rubric_id, trace_id, ...judged }, { onConflict: "rubric_id,trace_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
