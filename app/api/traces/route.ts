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
  const model = url.searchParams.get("model");
  const rating = url.searchParams.get("rating");
  const tag = url.searchParams.getAll("tag");
  const q = url.searchParams.get("q");
  const cursor = url.searchParams.get("cursor");

  const supabase = getServerSupabase();

  let query = supabase
    .from("traces_with_latest_annotation")
    .select("*")
    .eq("source", "live")
    .order("created_at", { ascending: false })
    .limit(100);

  // workspace supersedes agent if both are passed
  if (workspace && workspace !== "all") {
    query = query.eq("agent", workspace);
  } else if (agent) {
    query = query.eq("agent", agent);
  }
  if (model) {
    query = query.eq("model", model);
  }
  if (rating === "unrated") {
    query = query.is("latest_rating", null);
  } else if (rating && rating !== "all") {
    query = query.eq("latest_rating", parseInt(rating));
  }
  if (tag.length > 0) {
    query = query.contains("latest_tags", tag);
  }
  if (q) {
    query = query.or(`output.ilike.%${q}%,input::text.ilike.%${q}%`);
  }
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
