import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated, hasValidIngestToken } from "@/lib/auth";

const CompleteSchema = z.object({
  status: z.enum(["completed", "failed"]),
  error: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: dashboard cookie OR ingest token
  const authed = await isAuthenticated();
  const hasToken = hasValidIngestToken(request);
  if (!authed && !hasToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = CompleteSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const data = result.data;
  const supabase = getServerSupabase();

  const update: Record<string, unknown> = { status: data.status };
  if (data.status === "completed") {
    update.completed_at = new Date().toISOString();
  }
  if (data.error) {
    update.error = data.error;
  }

  const { error: updateError } = await supabase
    .from("experiments")
    .update(update)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update experiment", detail: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
