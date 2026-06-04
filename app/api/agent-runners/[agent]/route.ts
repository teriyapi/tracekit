import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent } = await params;
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("agent_runners")
    .select("*")
    .eq("agent", agent)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent } = await params;
  const supabase = getServerSupabase();

  const { error } = await supabase
    .from("agent_runners")
    .delete()
    .eq("agent", agent);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
