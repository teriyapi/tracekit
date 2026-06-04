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
import type { AgentRunner } from "@/lib/db/types";
import { relativeTime } from "@/lib/utils";

export function SettingsClient({
  initialRunners,
  workspace,
}: {
  initialRunners: AgentRunner[];
  workspace: string;
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
        runner_url: (isAllWorkspace ? newUrl.trim() : newUrl.trim()) || undefined,
        runner_token: (isAllWorkspace ? newToken.trim() : newToken.trim()) || undefined,
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

  async function handleSave(agent: string, field: "runner_url" | "runner_token", value: string) {
    const existing = runners.find((r) => r.agent === agent);
    if (!existing) return;
    const res = await fetch("/api/agent-runners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        runner_url: field === "runner_url" ? value : existing.runner_url,
        runner_token: field === "runner_token" ? value : existing.runner_token,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setRunners((prev) => prev.map((r) => (r.agent === agent ? data : r)));
      toast.success("Saved");
    } else {
      toast.error("Failed to save");
    }
  }

  // Per-workspace: show single runner config
  if (!isAllWorkspace) {
    if (!singleRunner || (!singleRunner.runner_url && !singleRunner.runner_token)) {
      return (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">{workspace} Settings</h2>
          <div className="border rounded-md p-6 space-y-4">
            <p className="text-muted-foreground">No runner configured for this agent.</p>
            <p className="text-sm text-muted-foreground">
              Configure a runner URL and token so tracekit can trigger experiment runs against this agent remotely.
            </p>
            <div className="grid grid-cols-2 gap-3">
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
            <Button size="sm" onClick={handleAdd} disabled={!newUrl.trim()}>
              Save runner config
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">{workspace} Settings</h2>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Runner URL</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="w-28">Updated</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SingleRunnerRow
                runner={singleRunner}
                onSave={handleSave}
                onClear={handleClearRunner}
              />
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
              <RunnerRow
                key={runner.agent}
                runner={runner}
                onSave={handleSave}
                onDelete={handleDelete}
              />
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
      <div className="border rounded-md p-4 space-y-3">
        <p className="text-sm font-medium">+ Add agent runner</p>
        <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}

function SingleRunnerRow({
  runner,
  onSave,
  onClear,
}: {
  runner: AgentRunner;
  onSave: (agent: string, field: "runner_url" | "runner_token", value: string) => void;
  onClear: (agent: string) => void;
}) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlValue, setUrlValue] = useState(runner.runner_url || "");
  const [editingToken, setEditingToken] = useState(false);
  const [tokenValue, setTokenValue] = useState(runner.runner_token || "");

  return (
    <TableRow>
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
            className="text-xs cursor-pointer hover:underline"
            onDoubleClick={() => setEditingUrl(true)}
            title="Double-click to edit"
          >
            {runner.runner_url || <span className="text-muted-foreground italic">not set</span>}
          </span>
        )}
      </TableCell>
      <TableCell>
        {editingToken ? (
          <Input
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            onBlur={() => { onSave(runner.agent, "runner_token", tokenValue); setEditingToken(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onSave(runner.agent, "runner_token", tokenValue); setEditingToken(false); }
              if (e.key === "Escape") { setTokenValue(runner.runner_token || ""); setEditingToken(false); }
            }}
            autoFocus
            className="h-7 text-xs"
          />
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {runner.runner_token ? "••••••••" : <span className="italic">not set</span>}
            </span>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setEditingToken(true)}>
              edit
            </Button>
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {relativeTime(runner.updated_at)}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => onClear(runner.agent)}>
          Remove config
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RunnerRow({
  runner,
  onSave,
  onDelete,
}: {
  runner: AgentRunner;
  onSave: (agent: string, field: "runner_url" | "runner_token", value: string) => void;
  onDelete: (agent: string) => void;
}) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlValue, setUrlValue] = useState(runner.runner_url || "");
  const [editingToken, setEditingToken] = useState(false);
  const [tokenValue, setTokenValue] = useState(runner.runner_token || "");

  return (
    <TableRow>
      <TableCell className="font-medium">{runner.agent}</TableCell>
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
            className="text-xs cursor-pointer hover:underline"
            onDoubleClick={() => setEditingUrl(true)}
            title="Double-click to edit"
          >
            {runner.runner_url || <span className="text-muted-foreground italic">not set</span>}
          </span>
        )}
      </TableCell>
      <TableCell>
        {editingToken ? (
          <Input
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            onBlur={() => { onSave(runner.agent, "runner_token", tokenValue); setEditingToken(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onSave(runner.agent, "runner_token", tokenValue); setEditingToken(false); }
              if (e.key === "Escape") { setTokenValue(runner.runner_token || ""); setEditingToken(false); }
            }}
            autoFocus
            className="h-7 text-xs"
          />
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {runner.runner_token ? "••••••••" : <span className="italic">not set</span>}
            </span>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setEditingToken(true)}>
              edit
            </Button>
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {relativeTime(runner.updated_at)}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => onDelete(runner.agent)}>
          Delete
        </Button>
      </TableCell>
    </TableRow>
  );
}
