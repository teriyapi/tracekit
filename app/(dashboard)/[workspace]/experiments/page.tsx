import { Suspense } from "react";
import { getRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/db/server";
import { ExperimentsTabClient } from "./experiments-tab-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExperimentWithStats } from "@/lib/db/types";

async function ExperimentsData({ workspace }: { workspace: string }) {
  const supabase = getServerSupabase();

  let query = supabase
    .from("experiments_with_stats")
    .select("*")
    .order("created_at", { ascending: false });

  if (workspace !== "all") {
    query = query.eq("agent", workspace);
  }

  const { data } = await query;

  return (
    <ExperimentsTabClient
      initialExperiments={(data || []) as ExperimentWithStats[]}
      workspace={workspace}
      readOnly={(await getRole()) !== "owner"}
    />
  );
}

export default async function ExperimentsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ExperimentsData workspace={workspace} />
    </Suspense>
  );
}
