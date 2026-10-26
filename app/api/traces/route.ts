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
  const source = url.searchParams.get("source") || "live";
  const q = url.searchParams.get("q");
  const cursor = url.searchParams.get("cursor");

  const supabase = getServerSupabase();

  let query = supabase
    .from("traces_with_latest_annotation")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (source === "live" || source === "experiment") {
    query = query.eq("source", source);
  }
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
    // Escape LIKE wildcards, then quote for PostgREST so commas and parens in q can't break the filter
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const quoted = `"${pattern.replace(/["\\]/g, "\\$&")}"`;
    query = query.or(`output.ilike.${quoted},input->>user_message.ilike.${quoted}`);
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
