import { Suspense } from "react";
import { getRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/db/server";
import { TracesTableClient } from "./traces-table-client";
import { TracesTableSkeleton } from "./traces-table-skeleton";
import { notFound } from "next/navigation";
import type { TraceWithLatestAnnotation } from "@/lib/db/types";

async function TracesData({ workspace }: { workspace: string }) {
  const supabase = getServerSupabase();

  if (workspace !== "all") {
    const { data: agentCheck } = await supabase
      .from("traces")
      .select("agent")
      .eq("agent", workspace)
      .limit(1);
    if (!agentCheck || agentCheck.length === 0) {
      notFound();
    }
  }

  let query = supabase
    .from("traces_with_latest_annotation")
    .select("*")
    .eq("source", "live")
    .order("created_at", { ascending: false })
    .limit(100);

  if (workspace !== "all") {
    query = query.eq("agent", workspace);
  }

  const { data } = await query;

  return (
    <TracesTableClient
      initialTraces={(data || []) as TraceWithLatestAnnotation[]}
      workspace={workspace}
      readOnly={(await getRole()) !== "owner"}
    />
  );
}

export default async function TracesPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <Suspense fallback={<TracesTableSkeleton />}>
      <TracesData workspace={workspace} />
    </Suspense>
  );
}
