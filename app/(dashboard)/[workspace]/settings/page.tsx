import { Suspense } from "react";
import { getServerSupabase } from "@/lib/db/server";
import { SettingsClient } from "./settings-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentRunner } from "@/lib/db/types";

async function SettingsData({ workspace }: { workspace: string }) {
  const supabase = getServerSupabase();

  let query = supabase.from("agent_runners").select("*").order("agent");

  if (workspace !== "all") {
    query = query.eq("agent", workspace);
  }

  const { data } = await query;

  return (
    <SettingsClient
      initialRunners={(data || []) as AgentRunner[]}
      workspace={workspace}
    />
  );
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      }
    >
      <SettingsData workspace={workspace} />
    </Suspense>
  );
}
