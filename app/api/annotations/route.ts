import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServerSupabase } from "@/lib/db/server";
import { isAuthenticated } from "@/lib/auth";

const CreateAnnotationSchema = z.object({
  trace_id: z.string().uuid(),
  rating: z.number().min(1).max(5).optional(),
  reason: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = CreateAnnotationSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", issues: result.error.issues }, { status: 400 });
  }

  const { trace_id, rating, reason, tags } = result.data;
  const supabase = getServerSupabase();

  // Upsert any new tags
  if (tags && tags.length > 0) {
    const tagRows = tags.map((name) => ({ name }));
    await supabase.from("tags").upsert(tagRows, { onConflict: "name" });
  }

  // Insert annotation
  const { data, error } = await supabase
    .from("annotations")
    .insert({
      trace_id,
      rating: rating || null,
      reason: reason || null,
      tags: tags || [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
