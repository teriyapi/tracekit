/**
 * Read-only snapshot of the teri agent's traces.
 *
 * Usage: pnpm dlx tsx --env-file=.env.local scripts/inspect-teri-traces.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function shape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [`${value.length} items of`, shape(value[0], depth + 1)];
  }
  if (value && typeof value === "object") {
    if (depth > 3) return "{…}";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shape(v, depth + 1)])
    );
  }
  return typeof value;
}

async function count(source?: "live" | "experiment") {
  let q = supabase.from("traces").select("id", { count: "exact", head: true }).eq("agent", "teri");
  if (source) q = q.eq("source", source);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

async function main() {
  console.log("== teri traces");
  console.log(`total: ${await count()}  live: ${await count("live")}  experiment: ${await count("experiment")}`);

  const { data: meta, error: metaError } = await supabase
    .from("traces")
    .select("metadata")
    .eq("agent", "teri");
  if (metaError) throw metaError;
  const callSites = new Map<string, number>();
  for (const row of meta ?? []) {
    const site = (row.metadata as Record<string, unknown> | null)?.call_site;
    const key = typeof site === "string" ? site : "(none)";
    callSites.set(key, (callSites.get(key) ?? 0) + 1);
  }
  console.log("\n== metadata.call_site");
  for (const [site, n] of callSites) console.log(`${site}: ${n}`);

  const { data: tagged } = await supabase
    .from("traces_with_latest_annotation")
    .select("latest_tags, latest_rating")
    .eq("agent", "teri");
  const rated = (tagged ?? []).filter((t) => t.latest_rating != null).length;
  const withTags = (tagged ?? []).filter((t) => (t.latest_tags ?? []).length > 0).length;
  console.log(`\n== annotations: ${rated} rated, ${withTags} with tags`);

  const { data: recent, error: recentError } = await supabase
    .from("traces")
    .select("id, created_at, input, output, metadata")
    .eq("agent", "teri")
    .eq("source", "live")
    .order("created_at", { ascending: false })
    .limit(3);
  if (recentError) throw recentError;

  console.log("\n== 3 most recent live traces");
  for (const t of recent ?? []) {
    console.log(`\n-- ${t.id}  ${t.created_at}`);
    console.log("input shape:", JSON.stringify(shape(t.input), null, 2));
    const messages = (t.input as { messages?: { role: string; content: unknown }[] }).messages ?? [];
    console.log(`messages: ${messages.length} (${messages.map((m) => m.role).join(", ")})`);
    console.log("metadata keys:", Object.keys(t.metadata ?? {}).join(", "));
    console.log("output:", String(t.output).slice(0, 300));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
