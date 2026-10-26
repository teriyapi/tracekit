import { Suspense } from "react";
import { getRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/db/server";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { loadTasteExamples } from "@/lib/taste/examples";
import type { JudgeScore, Rubric } from "@/lib/db/types";
import { TasteClient } from "./taste-client";

/** Postgres "undefined table", or PostgREST not finding it in its schema cache. */
function isMissingTable(error: { code?: string; message: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message));
}

async function TasteData({ workspace }: { workspace: string }) {
  const supabase = getServerSupabase();

  const examples = await loadTasteExamples(workspace);

  const { data: rubricRows, error: rubricError } = await supabase
    .from("rubrics")
    .select("*")
    .eq("agent", workspace)
    .order("version", { ascending: false });

  const rubrics = (rubricRows || []) as Rubric[];
  let scores: JudgeScore[] = [];
  let scoresMissing = false;
  if (rubrics.length > 0) {
    const { data, error } = await supabase
      .from("judge_scores")
      .select("*")
      .in("rubric_id", rubrics.map((r) => r.id));
    scores = (data || []) as JudgeScore[];
    scoresMissing = isMissingTable(error);
  }

  return (
    <TasteClient
      agent={workspace}
      initialExamples={examples}
      initialRubrics={rubrics}
      initialScores={scores}
      missingMigrations={[
        ...(isMissingTable(rubricError) ? ["001_rubrics.sql"] : []),
        ...(isMissingTable(rubricError) || scoresMissing ? ["002_judge.sql"] : []),
      ]}
      readOnly={(await getRole()) !== "owner"}
    />
  );
}

export default async function TastePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  if (workspace === "all") {
    return (
      <Card className="mt-8 max-w-lg mx-auto">
        <CardContent className="py-10 text-center text-muted-foreground">
          Taste is learned per agent. Pick an agent from the switcher above.
        </CardContent>
      </Card>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <TasteData workspace={workspace} />
    </Suspense>
  );
}
