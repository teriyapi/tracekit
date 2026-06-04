import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace");
  const agent = url.searchParams.get("agent");

  const supabase = getServerSupabase();
  let query = supabase
    .from("experiments_with_stats")
    .select("*")
    .order("created_at", { ascending: false });

  // workspace supersedes agent if both are passed
  if (workspace && workspace !== "all") {
    query = query.eq("agent", workspace);
  } else if (agent) {
    query = query.eq("agent", agent);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
