import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";
import type { TraceWithLatestAnnotation } from "@/lib/db/types";

const CORRELATION_PREFIX = "_correlation_";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServerSupabase();

  // 1. Fetch the focal trace
  const { data: focalArr, error: focalError } = await supabase
    .from("traces")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (focalError || !focalArr || focalArr.length === 0) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 });
  }

  const focal = focalArr[0];
  const metadata = (focal.metadata || {}) as Record<string, unknown>;

  // 2. Extract correlation keys
  const correlationEntries: { key: string; type: string; value: string }[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith(CORRELATION_PREFIX) && typeof value === "string") {
      correlationEntries.push({
        key,
        type: key.slice(CORRELATION_PREFIX.length),
        value,
      });
    }
  }

  if (correlationEntries.length === 0) {
    return NextResponse.json({ correlations: [] });
  }

  // 3. For each correlation key, query related traces (same agent, same value, not self)
  // Using path (b): separate queries per correlation key, merged in JS
  const correlations = await Promise.all(
    correlationEntries.map(async (entry) => {
      const { data, error } = await supabase
        .from("traces_with_latest_annotation")
        .select("*")
        .eq("agent", focal.agent)
        .neq("id", id)
        .filter(`metadata->>${entry.key}`, "eq", entry.value)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) {
        console.error(`Correlation query failed for ${entry.key}:`, error.message);
        return { ...entry, traces: [] as TraceWithLatestAnnotation[] };
      }

      return {
        ...entry,
        traces: (data || []) as TraceWithLatestAnnotation[],
      };
    })
  );

  // Filter out correlation types with no related traces
  const nonEmpty = correlations.filter((c) => c.traces.length > 0);

  return NextResponse.json({ correlations: nonEmpty });
}
