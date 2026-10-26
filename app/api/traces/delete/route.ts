import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isOwner } from "@/lib/auth";

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

  const { trace_ids } = body as { trace_ids?: string[] };

  if (!trace_ids || !Array.isArray(trace_ids) || trace_ids.length === 0) {
    return NextResponse.json({ error: "trace_ids is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Delete annotations first (foreign key)
  await supabase.from("annotations").delete().in("trace_id", trace_ids);

  // Delete traces
  const { error } = await supabase.from("traces").delete().in("id", trace_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: trace_ids.length });
}
