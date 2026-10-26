"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { PublicAgentRunner } from "@/lib/db/types";
import { relativeTime } from "@/lib/utils";

const READ_ONLY_TITLE = "Read-only demo";

type SaveField = (agent: string, field: "runner_url" | "runner_token", value: string) => void;

export function SettingsClient({
  initialRunners,
  workspace,
  readOnly = false,
}: {
  initialRunners: PublicAgentRunner[];
  workspace: string;
  readOnly?: boolean;
}) {
  const [runners, setRunners] = useState(initialRunners);
  const isAllWorkspace = workspace === "all";

  // For per-workspace: single runner or empty
  const singleRunner = !isAllWorkspace ? runners[0] ?? null : null;

  // Add runner form state (only for "all" workspace)
  const [newAgent, setNewAgent] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newToken, setNewToken] = useState("");

  async function handleAdd() {
    const agent = isAllWorkspace ? newAgent.trim() : workspace;
    if (!agent) return;
    const res = await fetch("/api/agent-runners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        runner_url: newUrl.trim() || undefined,
        runner_token: newToken.trim() || undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setRunners((prev) => [...prev.filter((r) => r.agent !== data.agent), data]);
      setNewAgent("");
      setNewUrl("");
      setNewToken("");
      toast.success("Agent runner saved");
    } else {
      toast.error("Failed to save");
    }
  }

  async function handleDelete(agent: string) {
    const res = await fetch(`/api/agent-runners/${encodeURIComponent(agent)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setRunners((prev) => prev.filter((r) => r.agent !== agent));
      toast.success("Deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  async function handleClearRunner(agent: string) {
    const res = await fetch("/api/agent-runners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        runner_url: null,
        runner_token: null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setRunners((prev) => prev.map((r) => (r.agent === agent ? data : r)));
      toast.success("Runner config removed");
    } else {
      toast.error("Failed to update");
    }
  }

  // Sends only the edited field; the server keeps the other one
  const handleSave: SaveField = async (agent, field, value) => {
    const res = await fetch("/api/agent-runners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, [field]: value }),
    });
    if (res.ok) {
      const data = await res.json();
      setRunners((prev) => prev.map((r) => (r.agent === agent ? data : r)));
      toast.success("Saved");
    } else {
      toast.error("Failed to save");
    }
  };

  // Per-workspace: show single runner config
  if (!isAllWorkspace) {
    if (!singleRunner || (!singleRunner.runner_url && !singleRunner.has_token)) {
      return (
        <div className="space-y-6">
          <h1 className="text-lg font-semibold">{workspace} Settings</h1>
          <div className="border rounded-md p-6 space-y-4">
            <p className="text-muted-foreground">No runner configured for this agent.</p>
            <p className="text-sm text-muted-foreground">
              Configure a runner URL and token so tracekit can trigger experiment runs against this agent remotely.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                placeholder="Runner URL"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                disabled={readOnly}
              />
              <Input
                placeholder="Runner token"
                type="password"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newUrl.trim() || readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
            >
              Save runner config
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">{workspace} Settings</h1>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Runner URL</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="w-28">Updated</TableHead>
                <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <RunnerCells runner={singleRunner} onSave={handleSave} readOnly={readOnly} />
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => handleClearRunner(singleRunner.agent)}
                    disabled={readOnly}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                  >
                    Remove config
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // "all" workspace: full table
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Agent Runners</h2>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Runner URL</TableHead>
              <TableHead>Token</TableHead>
              <TableHead className="w-28">Updated</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runners.map((runner) => (
              <TableRow key={runner.agent}>
                <TableCell className="font-medium">{runner.agent}</TableCell>
                <RunnerCells runner={runner} onSave={handleSave} readOnly={readOnly} />
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => handleDelete(runner.agent)}
                    disabled={readOnly}
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {runners.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No runners configured yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add new runner */}
      {!readOnly && (
        <div className="border rounded-md p-4 space-y-3">
          <p className="text-sm font-medium">+ Add agent runner</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              placeholder="Agent name"
              value={newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
            />
            <Input
              placeholder="Runner URL"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <Input
              placeholder="Runner token"
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!newAgent.trim()}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

/** URL, token and updated cells, shared by the single-agent and all-agents tables. */
function RunnerCells({
  runner,
  onSave,
  readOnly,
}: {
  runner: PublicAgentRunner;
  onSave: SaveField;
  readOnly: boolean;
}) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlValue, setUrlValue] = useState(runner.runner_url || "");
  const [editingToken, setEditingToken] = useState(false);
  // The stored token never reaches the browser, so editing always starts blank
  const [tokenValue, setTokenValue] = useState("");

  function commitToken() {
    if (tokenValue.trim()) onSave(runner.agent, "runner_token", tokenValue.trim());
    setTokenValue("");
    setEditingToken(false);
  }

  return (
    <>
      <TableCell>
        {editingUrl ? (
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onBlur={() => { onSave(runner.agent, "runner_url", urlValue); setEditingUrl(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onSave(runner.agent, "runner_url", urlValue); setEditingUrl(false); }
              if (e.key === "Escape") { setUrlValue(runner.runner_url || ""); setEditingUrl(false); }
            }}
            autoFocus
            className="h-7 text-xs"
          />
        ) : (
          <span
            className={readOnly ? "text-xs" : "text-xs cursor-pointer hover:underline"}
            onDoubleClick={() => !readOnly && setEditingUrl(true)}
            title={readOnly ? undefined : "Double-click to edit"}
          >
            {runner.runner_url || <span className="text-muted-foreground italic">not set</span>}
          </span>
        )}
      </TableCell>
      <TableCell>
        {editingToken ? (
          <Input
            type="password"
            placeholder="New token"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            onBlur={commitToken}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitToken();
              if (e.key === "Escape") { setTokenValue(""); setEditingToken(false); }
            }}
            autoFocus
            className="h-7 text-xs"
          />
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {runner.has_token ? (
                `••••${runner.runner_token_hint ?? "••••"}`
              ) : (
                <span className="font-sans italic">not set</span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => setEditingToken(true)}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
            >
              {runner.has_token ? "replace" : "set"}
            </Button>
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {relativeTime(runner.updated_at)}
      </TableCell>
    </>
  );
}
