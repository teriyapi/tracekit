import { getServerSupabase } from "@/lib/db/server";
import type { TraceWithLatestAnnotation } from "@/lib/db/types";
import { extractExchange } from "@/lib/conversation";
import { isHoldoutTrace } from "@/lib/split";
import { VERDICTS, getVerdict, type Verdict } from "@/lib/verdicts";

/** A trace I've given a verdict, flattened for the rubric, the evidence cards, and the judge. */
export type TasteExample = {
  trace_id: string;
  source: "live" | "experiment";
  created_at: string;
  verdict: Verdict;
  note: string | null;
  userTurns: string[];
  reply: string;
  holdout: boolean;
};

export function toTasteExample(trace: TraceWithLatestAnnotation): TasteExample | null {
  const verdict = getVerdict(trace.latest_tags);
  if (!verdict) return null;
  const { userTurns, reply } = extractExchange(trace);
  return {
    trace_id: trace.id,
    source: trace.source,
    created_at: trace.created_at,
    verdict,
    note: trace.latest_reason,
    userTurns,
    reply,
    holdout: isHoldoutTrace(trace),
  };
}

/** Every trace for `agent` (live and experiment) whose latest tags carry a verdict. */
export async function loadTasteExamples(agent: string): Promise<TasteExample[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("traces_with_latest_annotation")
    .select("*")
    .eq("agent", agent)
    .overlaps("latest_tags", [...VERDICTS])
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);
  return ((data || []) as TraceWithLatestAnnotation[])
    .map(toTasteExample)
    .filter((e): e is TasteExample => e !== null);
}
