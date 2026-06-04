import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("traces")
    .select("agent")
    .order("agent");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate (Supabase doesn't support DISTINCT in the JS client easily)
  const agents = [...new Set((data || []).map((r) => r.agent))];
  return NextResponse.json(agents);
}
