import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

/** GET /api/judge/scores?rubric_id=… (repeatable) — scores for those rubric versions. */
export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rubricIds = new URL(request.url).searchParams.getAll("rubric_id");
  if (rubricIds.length === 0) {
    return NextResponse.json({ error: "rubric_id is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("judge_scores")
    .select("*")
    .in("rubric_id", rubricIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
