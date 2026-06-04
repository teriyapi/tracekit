import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

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

  const { data: experiment, error: expError } = await supabase
    .from("experiments_with_stats")
    .select("*")
    .eq("id", id)
    .single();

  if (expError || !experiment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: traces, error: tracesError } = await supabase
    .from("traces_with_latest_annotation")
    .select("*")
    .eq("experiment_id", id)
    .order("created_at", { ascending: true });

  if (tracesError) {
    return NextResponse.json({ error: tracesError.message }, { status: 500 });
  }

  return NextResponse.json({ experiment, traces: traces || [] });
}
