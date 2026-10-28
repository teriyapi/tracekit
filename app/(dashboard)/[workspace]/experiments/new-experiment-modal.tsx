"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RoseLoader } from "@/components/ui/rose-loader";
import type { PublicAgentRunner } from "@/lib/db/types";

function defaultName(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `experiment-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function NewExperimentModal({
  open,
  onOpenChange,
  onCreated,
  agent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (experimentId: string) => void;
  /** The workspace's agent. Only the "all" workspace asks which agent to run. */
  agent?: string;
}) {
  const [name, setName] = useState(defaultName());
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [customAgent, setCustomAgent] = useState("");
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [runner, setRunner] = useState<PublicAgentRunner | null>(null);
  const [runnerLoading, setRunnerLoading] = useState(false);

  const [dataset, setDataset] = useState<unknown[] | null>(null);
  const [datasetError, setDatasetError] = useState("");
  const [datasetCount, setDatasetCount] = useState(0);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [showCli, setShowCli] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectiveAgent = agent ?? (showCustomAgent ? customAgent.trim() : selectedAgent);
  const canSubmit = name.trim() && effectiveAgent && dataset && dataset.length > 0 && runner?.runner_url;

  // Fetch agents (only those with runners configured)
  useEffect(() => {
    if (open) {
      if (!agent) fetch("/api/agent-runners")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAgents(data.map((r: PublicAgentRunner) => r.agent)); });
      // Reset form
      setName(defaultName());
      setSelectedAgent("");
      setCustomAgent("");
      setShowCustomAgent(false);
      setDataset(null);
      setDatasetError("");
      setDatasetCount(0);
      setShowPaste(false);
      setPasteValue("");
      setShowCli(false);
      setRunner(null);
    }
  }, [open, agent]);

  // Fetch the runner on open and whenever the agent changes. Opening resets the form, so a fetch from before it opened would be wiped.
  useEffect(() => {
    if (!open) return;
    if (!effectiveAgent) {
      setRunner(null);
      return;
    }
    setRunnerLoading(true);
    fetch(`/api/agent-runners/${encodeURIComponent(effectiveAgent)}`)
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        setRunner(data);
        setRunnerLoading(false);
      })
      .catch(() => {
        setRunner(null);
        setRunnerLoading(false);
      });
  }, [open, effectiveAgent]);

  function validateDataset(raw: string): boolean {
    setDatasetError("");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setDatasetError("Must be a JSON array");
        return false;
      }
      if (parsed.length === 0) {
        setDatasetError("Array must not be empty");
        return false;
      }
      for (let i = 0; i < parsed.length; i++) {
        if (typeof parsed[i] !== "object" || parsed[i] === null || Array.isArray(parsed[i])) {
          setDatasetError(`Item ${i} must be an object`);
          return false;
        }
      }
      setDataset(parsed);
      setDatasetCount(parsed.length);
      return true;
    } catch {
      setDatasetError("Invalid JSON");
      return false;
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      validateDataset(text);
    };
    reader.readAsText(file);
  }

  function handlePasteApply() {
    validateDataset(pasteValue);
  }

  function handleAgentChange(value: string | null) {
    if (value === "__other__") {
      setShowCustomAgent(true);
      setSelectedAgent("");
    } else {
      setShowCustomAgent(false);
      setSelectedAgent(value || "");
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    const res = await fetch("/api/experiments/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), agent: effectiveAgent, dataset }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.success("Experiment started");
      onOpenChange(false);
      onCreated(data.experiment_id);

      // Dispatch the runner in the background — this client fetch stays alive.
      if (data.experiment_id) {
        fetch(`/api/experiments/${data.experiment_id}/run`, { method: "POST" }).catch((err) => {
          console.warn("[experiment] runner dispatch failed:", err);
        });
      }
    } else {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      toast.error(data.error || "Failed to start experiment");
    }
    setSubmitting(false);
  }

  const hostname = runner?.runner_url
    ? (() => { try { return new URL(runner.runner_url).hostname; } catch { return runner.runner_url; } })()
    : null;

  const cliCommand = `# In your agent's repo:\nnpx tsx scripts/run-experiment.ts \\\n  --name "${name.trim()}" \\\n  --agent "${effectiveAgent}" \\\n  --dataset path/to/dataset.json`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle>New Experiment</DialogTitle>
          <DialogDescription>
            {agent ? (
              <>
                Run a dataset against <span className="font-medium text-foreground">{agent}</span>.
              </>
            ) : (
              "Configure and launch an experiment run against your agent."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-name">Name</Label>
            <Input
              id="exp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Agent: only asked in the "all" workspace */}
          {!agent && (
          <div className="space-y-1.5">
            <Label>Agent</Label>
            {!showCustomAgent ? (
              <Select value={selectedAgent} onValueChange={(v: string | null) => handleAgentChange(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                  <SelectItem value="__other__">Other…</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Agent name"
                  value={customAgent}
                  onChange={(e) => setCustomAgent(e.target.value)}
                  autoFocus
                />
                <Button variant="ghost" size="sm" onClick={() => { setShowCustomAgent(false); setCustomAgent(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
          )}

          {/* Dataset */}
          <div className="space-y-1.5">
            <Label>Dataset</Label>
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-foreground/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {dataset ? (
                <p className="text-sm text-foreground">✓ {datasetCount} items loaded</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Drop a .json file here or click to browse
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {datasetError && (
              <p className="text-xs text-destructive">{datasetError}</p>
            )}
            {!showPaste ? (
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setShowPaste(true)}
              >
                or paste JSON
              </button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder='[{"input": "hello"}, ...]'
                  value={pasteValue}
                  onChange={(e) => {
                    setPasteValue(e.target.value);
                    if (e.target.value.trim()) validateDataset(e.target.value);
                  }}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>

          {/* Runner status */}
          {effectiveAgent && !runnerLoading && (
            // 24px off the dataset; the fields' 20px rhythm collapses into this margin
            <div className="mt-6 text-sm">
              {runner?.runner_url ? (
                <p className="text-foreground">✓ Runner configured at {hostname}</p>
              ) : (
                <div className="space-y-2 p-3 rounded-md bg-yellow-500/5 border border-yellow-500/20">
                  <p className="text-yellow-500 text-xs">
                    No runner configured for this agent. Configure one in Settings, or run via CLI.
                  </p>
                  {!showCli ? (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowCli(true)}>
                      Show CLI command
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <pre className="text-xs font-mono bg-muted p-2 rounded overflow-auto whitespace-pre-wrap max-h-48">
                        {cliCommand}
                      </pre>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(cliCommand);
                          toast.success("Copied to clipboard");
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-7 flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex-1"
            >
              {submitting ? <span className="inline-flex items-center gap-2"><RoseLoader size={16} /> Starting…</span> : "Start experiment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
