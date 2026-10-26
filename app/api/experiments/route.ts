import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";
import { isOwner, hasValidIngestToken } from "@/lib/auth";

const CreateExperimentSchema = z.object({
  name: z.string(),
  agent: z.string(),
  dataset: z.array(z.unknown()),
});

export async function POST(request: Request) {
  // Auth: dashboard cookie OR ingest token
  const authed = await isOwner();
  const hasToken = hasValidIngestToken(request);
  if (!authed && !hasToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = CreateExperimentSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }

  const data = result.data;
  const supabase = getServerSupabase();

  const { data: inserted, error: insertError } = await supabase
    .from("experiments")
    .insert({
      name: data.name,
      agent: data.agent,
      dataset: data.dataset,
      status: "pending",
      trace_count: 0,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create experiment", detail: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: inserted.id });
}
