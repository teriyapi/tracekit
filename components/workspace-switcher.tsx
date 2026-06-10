"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, Check, Plus } from "lucide-react";

export function WorkspaceSwitcher({ workspace }: { workspace: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [agents, setAgents] = useState<string[]>([]);
  const [sdkDialogOpen, setSdkDialogOpen] = useState(false);
  const cacheRef = useRef<{ agents: string[]; fetchedAt: number }>({
    agents: [],
    fetchedAt: 0,
  });

  const fetchAgents = useCallback(async () => {
    const now = Date.now();
    // Use cache if under 30s old
    if (now - cacheRef.current.fetchedAt < 30_000 && cacheRef.current.agents.length > 0) {
      setAgents(cacheRef.current.agents);
      return;
    }
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const sorted = [...data].sort((a, b) => a.localeCompare(b));
        cacheRef.current = { agents: sorted, fetchedAt: now };
        setAgents(sorted);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Refresh when workspace changes
  useEffect(() => {
    cacheRef.current.fetchedAt = 0; // invalidate cache
    fetchAgents();
  }, [workspace, fetchAgents]);

  function switchWorkspace(newWorkspace: string) {
    // Determine current sub-route (traces, experiments, settings)
    const segments = pathname.split("/").filter(Boolean);
    // segments: [workspace, subRoute] e.g. ["bartleby", "traces"]
    const subRoute = segments[1] || "traces";
    router.push(`/${newWorkspace}/${subRoute}`);
  }

  const displayName = workspace === "all" ? "all agents" : workspace;

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) fetchAgents(); }}>
        <DropdownMenuTrigger className="flex items-center gap-1.5 text-lg font-bold text-foreground hover:text-foreground/80 transition-colors outline-none cursor-pointer">
          {displayName}
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-[180px]">
          {agents.map((agent) => (
            <DropdownMenuItem
              key={agent}
              className="gap-2"
              onClick={() => switchWorkspace(agent)}
            >
              {workspace === agent ? (
                <Check className="size-3.5" />
              ) : (
                <span className="size-3.5" />
              )}
              {agent}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            onClick={() => switchWorkspace("all")}
          >
            {workspace === "all" ? (
              <Check className="size-3.5" />
            ) : (
              <span className="size-3.5" />
            )}
            all agents
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-muted-foreground"
            onClick={() => setSdkDialogOpen(true)}
          >
            <Plus className="size-3.5" />
            add via SDK
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={sdkDialogOpen} onOpenChange={setSdkDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a new agent via SDK</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Install the SDK and send your first trace. The agent will appear
              automatically in the workspace switcher.
            </p>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-48">
{`npm install @teriyapi/tracekit-sdk`}
            </pre>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-48">
{`import { track } from "@teriyapi/tracekit-sdk";

await track(
  {
    agent: "your-agent-name",
    input: { user_message: "..." },
  },
  async () => ({ output: "...", model: "..." })
);`}
            </pre>
            <div className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-48 font-mono">
              <p>TRACEKIT_API_URL=https://tracekit.vercel.app</p>
              <p>TRACEKIT_INGEST_TOKEN=&lt;your token&gt;</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
