import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/db/server";
import { Card, CardContent } from "@/components/ui/card";
import { SUNSET_AGENTS } from "@/lib/agents";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getServerSupabase();

  // Open on the most recently active agent, skipping sunset ones
  const sunset = Object.keys(SUNSET_AGENTS);
  let query = supabase.from("traces").select("agent").order("created_at", { ascending: false }).limit(1);
  if (sunset.length > 0) query = query.not("agent", "in", `(${sunset.join(",")})`);
  const { data: recentTrace } = await query;

  if (recentTrace && recentTrace.length > 0) {
    redirect(`/${recentTrace[0].agent}/traces`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
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
            <p>TRACEKIT_API_URL=https://tracekit.vercel.app</p>
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
