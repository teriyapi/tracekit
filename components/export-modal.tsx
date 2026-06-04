"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useSelection } from "@/lib/context/selection";
import { formatDateForFile } from "@/lib/utils";

const QUICK_ACTIONS = [
  { key: "failing", label: "Failing cases" },
  { key: "ambiguous", label: "Ambiguous cases" },
  { key: "good", label: "Really good cases" },
  { key: "tagged", label: "Tagged collection" },
  { key: "custom", label: "Custom" },
] as const;

type QuickActionKey = (typeof QUICK_ACTIONS)[number]["key"];

const QUICK_ACTION_TEMPLATES: Record<QuickActionKey, string> = {
  failing: `Task: review these failing cases from the agent and propose specific edits to the system prompt to fix the issues. Each case has a rating and a reason explaining why it failed. Output: (1) a brief diagnosis of the common failure pattern across cases, (2) the exact text edits to make to the system prompt (show before/after). Don't change voice rules unless the failures are voice violations. Be conservative — minimal edits to fix the observed failures.`,

  ambiguous: `Task: review these cases where the agent's output is ambiguous or borderline — the rating is 3 and the reason explains the tension. These are cases where neither a clear pass nor a clear fail. Help me decide: should the agent's behavior change, or should my eval rubric be more specific? Output: for each case, recommend either (a) a specific prompt fix to remove the ambiguity, or (b) a clarification of the rubric so future cases like this are unambiguous. Don't make changes — just propose them with reasoning.`,

  good: `Task: these are cases where the agent performed well. Extract the patterns that made these answers good — voice, structure, length, framing — and suggest whether any of these patterns should be made more explicit in the system prompt as positive examples. Output: a list of patterns observed, and for each one, a yes/no recommendation on whether to add it to the prompt as a few-shot example. Conservative bias — only suggest adding examples for patterns that are concretely transferable.`,

  tagged: `Task: these traces have been tagged with different labels — each trace's annotation.tags array tells you how it was categorized. Group the traces by their tags and analyze the patterns within each group. For each tag group: (1) summarize what the traces in that group have in common, (2) identify whether the tag represents a strength, weakness, or behavioral pattern, (3) suggest specific prompt edits that address the group — reinforce the behavior if it's good, fix it if it's bad. If a trace has multiple tags, consider it in each relevant group. Output: a tag-by-tag breakdown with concrete prompt edit recommendations, then a final summary of cross-cutting patterns across tags.`,

  custom: ``,
};

export function ExportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { selectedTraceIds } = useSelection();
  const [activeAction, setActiveAction] = useState<QuickActionKey>("failing");
  const [task, setTask] = useState(QUICK_ACTION_TEMPLATES.failing);
  const [exporting, setExporting] = useState(false);

  const traceIds = Array.from(selectedTraceIds);
  const count = traceIds.length;

  function handleActionChange(key: QuickActionKey) {
    setActiveAction(key);
    setTask(QUICK_ACTION_TEMPLATES[key]);
  }

  async function handleExport() {
    if (count === 0 || !task.trim()) return;
    setExporting(true);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trace_ids: traceIds, task }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        toast.error(data.error || "Export failed");
        setExporting(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tracekit-export-${formatDateForFile(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${count} traces`);
      onOpenChange(false);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {count} traces</DialogTitle>
          <DialogDescription>
            Choose a task template and export selected traces as JSON for use with Claude Code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.key}
                variant={activeAction === action.key ? "default" : "outline"}
                size="sm"
                onClick={() => handleActionChange(action.key)}
              >
                {action.label}
              </Button>
            ))}
          </div>

          {/* Task textarea */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Task for Claude Code</label>
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={6}
              placeholder="Describe what Claude Code should do with these traces…"
            />
          </div>

          {/* Summary */}
          <p className="text-xs text-muted-foreground">
            Exporting {count} selected trace{count !== 1 ? "s" : ""}
          </p>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || count === 0}
              className="flex-1"
            >
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
