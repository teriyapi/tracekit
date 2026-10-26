import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";
import { isOwner } from "@/lib/auth";
import { loadTasteExamples } from "@/lib/taste/examples";
import { draftRubric } from "@/lib/taste/llm";
import type { Rubric } from "@/lib/db/types";

// Drafting reads every training example in one call; give it room.
export const maxDuration = 120;

const DraftSchema = z.object({
  agent: z.string().min(1),
});

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

  const result = DraftSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", issues: result.error.issues }, { status: 400 });
  }

  const { agent } = result.data;

  let train;
  try {
    train = (await loadTasteExamples(agent)).filter((e) => !e.holdout);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (train.length === 0) {
    return NextResponse.json(
      { error: "No training verdicts yet. Tag some traces hit / miss / cringe first." },
      { status: 400 }
    );
  }

  // Revise the latest saved version if there is one
  const supabase = getServerSupabase();
  const { data: latest } = await supabase
    .from("rubrics")
    .select("*")
    .eq("agent", agent)
    .order("version", { ascending: false })
    .limit(1);
  const previous = (latest?.[0] as Rubric | undefined) ?? null;

  try {
    const criteria = await draftRubric(train, previous?.criteria);
    return NextResponse.json({
      criteria,
      train_trace_ids: train.map((e) => e.trace_id),
      revised_from_version: previous?.version ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: `Draft failed: ${(err as Error).message}` }, { status: 502 });
  }
}
