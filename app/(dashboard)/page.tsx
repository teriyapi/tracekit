import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/db/server";
import { Card, CardContent } from "@/components/ui/card";

export default async function DashboardRoot() {
  const supabase = getServerSupabase();

  const { data: recentTrace } = await supabase
    .from("traces")
    .select("agent")
    .order("created_at", { ascending: false })
    .limit(1);

  if (recentTrace && recentTrace.length > 0) {
    redirect(`/${recentTrace[0].agent}/traces`);
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="max-w-lg w-full">
        <CardContent className="py-10 text-center space-y-6">
          <h2 className="text-xl font-semibold">Welcome to tracekit</h2>
          <p className="text-muted-foreground">
            No traces yet. Send your first trace to see it appear here.
          </p>

          <pre className="text-left text-xs bg-muted p-4 rounded-md overflow-auto max-h-48">
{`import { track } from "@teriyapi/tracekit-sdk";

await track(
  {
    agent: "your-agent-name",
    input: { user_message: "..." },
  },
  async () => ({ output: "...", model: "..." })
);`}
          </pre>

          <div className="text-left text-xs bg-muted p-4 rounded-md overflow-auto max-h-48 font-mono">
            <p>TRACEKIT_API_URL=http://localhost:3001</p>
            <p>TRACEKIT_INGEST_TOKEN=&lt;your token&gt;</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Refresh once you&apos;ve sent a trace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
