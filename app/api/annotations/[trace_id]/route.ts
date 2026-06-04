import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ trace_id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trace_id } = await params;
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("trace_id", trace_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
