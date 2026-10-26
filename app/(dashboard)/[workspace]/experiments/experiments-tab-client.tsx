"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, CircleCheck, CircleDashed, CircleX, Hourglass, type LucideIcon } from "lucide-react";
import type { ExperimentWithStats, TraceWithLatestAnnotation } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { ComparisonPanel } from "./comparison-panel";
import { ConvoView } from "./convo-view";
import { Segmented } from "@/components/ui/segmented";
import { useStoredView, type View } from "@/lib/stored-view";
import { InlineEditName } from "./inline-edit-name";
import { TraceSheet, type AnnotationPatch } from "@/components/traces/trace-sheet";
import { useSelection } from "@/lib/context/selection";
import { NewExperimentModal } from "./new-experiment-modal";
import { RoseLoader } from "@/components/ui/rose-loader";
import { isStalled, STALLED_TITLE } from "@/lib/experiments";

type PanelData = {
  experiment: ExperimentWithStats;
  traces: TraceWithLatestAnnotation[];
};

export function ExperimentsTabClient({
  initialExperiments,
  workspace,
  readOnly = false,
}: {
  initialExperiments: ExperimentWithStats[];
  workspace: string;
  readOnly?: boolean;
}) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [pulsingPanelId, setPulsingPanelId] = useState<string | null>(null);
  const [hoveredInputKey, setHoveredInputKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [view, writeView] = useStoredView("tracekit:experiments-view");
  const groups = useMemo(() => groupByDataset(experiments), [experiments]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Trace sheet state
  const [sheetTrace, setSheetTrace] = useState<TraceWithLatestAnnotation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Polling: refetch list every 2s while any experiment is pending/running
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasActive = experiments.some((e) => e.status === "pending" || e.status === "running");

  // Check if any open panel has a running/pending experiment
  const hasRunningPanel = panels.some(
    (p) => p.experiment.status === "pending" || p.experiment.status === "running"
  );

  const refetchList = useCallback(async () => {
    const params = new URLSearchParams();
    if (workspace !== "all") params.set("workspace", workspace);
    const res = await fetch(`/api/experiments/list?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    setExperiments((prev) => {
      // Detect status changes for open panels
      for (const exp of data as ExperimentWithStats[]) {
        const old = prev.find((p) => p.id === exp.id);
        if (old && old.status !== exp.status) {
          // Refresh panel if open
          const panel = panels.find((p) => p.experiment.id === exp.id);
          if (panel) {
            fetch(`/api/experiments/${exp.id}`)
              .then((r) => r.json())
              .then((detail) => {
                setPanels((ps) =>
                  ps.map((p) =>
                    p.experiment.id === exp.id
                      ? { experiment: detail.experiment, traces: detail.traces }
                      : p
                  )
                );
              });
          }
        }
      }
      return data;
    });
  }, [panels]);

  // Poll running panels for new traces
  const tracePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetchRunningPanels = useCallback(async () => {
    const runningPanels = panels.filter(
      (p) => p.experiment.status === "pending" || p.experiment.status === "running"
    );
    for (const panel of runningPanels) {
      const res = await fetch(`/api/experiments/${panel.experiment.id}`);
      if (!res.ok) continue;
      const detail = await res.json();
      setPanels((ps) =>
        ps.map((p) =>
          p.experiment.id === panel.experiment.id
            ? { experiment: detail.experiment, traces: detail.traces }
            : p
        )
      );
    }
  }, [panels]);

  useEffect(() => {
    if (hasActive) {
      pollRef.current = setInterval(refetchList, 2000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasActive, refetchList]);

  useEffect(() => {
    if (hasRunningPanel) {
      tracePollRef.current = setInterval(refetchRunningPanels, 2000);
    } else if (tracePollRef.current) {
      clearInterval(tracePollRef.current);
      tracePollRef.current = null;
    }
    return () => {
      if (tracePollRef.current) clearInterval(tracePollRef.current);
    };
  }, [hasRunningPanel, refetchRunningPanels]);

  async function handleExperimentCreated(experimentId: string) {
    await refetchList();
    // Auto-open a panel for the new experiment
    if (experimentId && !panels.some((p) => p.experiment.id === experimentId)) {
      const res = await fetch(`/api/experiments/${experimentId}`);
      if (res.ok) {
        const data = await res.json();
        setPanels((prev) => [...prev, { experiment: data.experiment, traces: data.traces }]);
      }
    }
  }

  async function openPanel(expId: string) {
    // Already open?
    if (panels.some((p) => p.experiment.id === expId)) {
      setPulsingPanelId(expId);
      setTimeout(() => setPulsingPanelId(null), 600);
      return;
    }

    // Max 4 panels
    if (panels.length >= 4) {
      toast.error("Maximum 4 experiments side by side. Close one to add another.");
      return;
    }

    const res = await fetch(`/api/experiments/${expId}`);
    if (!res.ok) {
      toast.error("Failed to load experiment");
      return;
    }
    const data = await res.json();
    setPanels((prev) =>
      prev.some((p) => p.experiment.id === expId)
        ? prev
        : [...prev, { experiment: data.experiment, traces: data.traces }]
    );
  }

  function togglePanel(expId: string) {
    if (panels.some((p) => p.experiment.id === expId)) closePanel(expId);
    else openPanel(expId);
  }

  function closePanel(expId: string) {
    setPanels((prev) => prev.filter((p) => p.experiment.id !== expId));
  }

  function handleRename(expId: string, newName: string) {
    setExperiments((prev) =>
      prev.map((e) => (e.id === expId ? { ...e, name: newName } : e))
    );
    setPanels((prev) =>
      prev.map((p) =>
        p.experiment.id === expId
          ? { ...p, experiment: { ...p.experiment, name: newName } }
          : p
      )
    );
  }

  function handleTraceClick(trace: TraceWithLatestAnnotation) {
    setSheetTrace(trace);
    setSheetOpen(true);
  }

  const handleAnnotationSaved = useCallback(() => {
    // Refresh panel data for the affected trace
    panels.forEach(async (panel) => {
      if (panel.traces.some((t) => t.id === sheetTrace?.id)) {
        const res = await fetch(`/api/experiments/${panel.experiment.id}`);
        if (res.ok) {
          const data = await res.json();
          setPanels((prev) =>
            prev.map((p) =>
              p.experiment.id === panel.experiment.id
                ? { ...p, experiment: data.experiment, traces: data.traces }
                : p
            )
          );
        }
      }
    });
  }, [panels, sheetTrace]);

  function handleTagsSaved(traceId: string, patch: AnnotationPatch) {
    setPanels((prev) =>
      prev.map((p) => ({
        ...p,
        traces: p.traces.map((t) => (t.id === traceId ? { ...t, ...patch } : t)),
      }))
    );
  }

  return (
    <>
      <div className="flex h-[calc(100vh-7rem)] gap-4 max-md:flex-col">
        {/* Experiment picker: click one to open it, click more to compare side by side */}
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-md border max-md:max-h-64 max-md:w-full">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <h1 className="text-sm font-semibold">Experiments</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(true)}
              disabled={readOnly}
              title={readOnly ? "Read-only demo" : undefined}
            >
              + New
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-1">
            {groups.map((group) => {
              const expanded = !collapsed.has(group.key);
              return (
                <div key={group.key} className="pb-1">
                  <h2 className="sticky top-0 z-10 bg-background pt-1">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleGroup(group.key)}
                      title={group.preview ? `First item: ${group.preview}` : undefined}
                      className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronRight className={cn("size-3.5 shrink-0 transition-transform duration-150", expanded && "rotate-90")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{group.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {group.size} {group.size === 1 ? "trace" : "traces"}
                      </span>
                    </button>
                  </h2>
                  {expanded && (
                    <div className="space-y-px">
                      {group.experiments.map((exp) => (
                        <ExperimentItem
                          key={exp.id}
                          experiment={exp}
                          open={panels.some((p) => p.experiment.id === exp.id)}
                          onToggle={() => togglePanel(exp.id)}
                          onRename={handleRename}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {experiments.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                No experiments yet. Use the SDK to run experiments.
              </p>
            )}
          </div>
        </aside>

        {/* Comparison area */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-3">
            <Segmented
              label="View"
              value={view}
              onChange={writeView}
              options={[
                { value: "convo", label: "convo" },
                { value: "table", label: "table" },
              ]}
            />
            <span className="truncate text-xs text-muted-foreground">
              {panels.length === 0
                ? "Pick an experiment on the left"
                : panels.length < 4
                  ? "Pick another to compare side by side"
                  : "4 side by side (max)"}
            </span>
          </div>
          <ComparisonArea
            panels={panels}
            view={view}
            readOnly={readOnly}
            paused={sheetOpen}
            pulsingPanelId={pulsingPanelId}
            hoveredInputKey={hoveredInputKey}
            onHoverInputKey={setHoveredInputKey}
            onClose={closePanel}
            onRename={handleRename}
            onTraceClick={handleTraceClick}
            onTagsSaved={handleTagsSaved}
          />
        </section>
      </div>

      {/* Shared trace sheet */}
      <TraceSheet
        trace={sheetTrace}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAnnotationSaved={handleAnnotationSaved}
        onTagsSaved={handleTagsSaved}
        readOnly={readOnly}
        traces={panels.flatMap((p) => p.traces)}
        onNavigate={(t) => { setSheetTrace(t); }}
      />

      {/* New experiment modal */}
      <NewExperimentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleExperimentCreated}
      />
    </>
  );
}

// Runs are named `<base>-YYYY-MM-DD_HH-MM-SS`; the open panel shows when it ran, so the list shows just the base
const RUN_STAMP = /[-_]\d{4}-\d{2}-\d{2}[_T-]\d{2}-\d{2}(?:-\d{2})?$/;

function shortName(name: string): string {
  const base = name.replace(RUN_STAMP, "");
  return base || name;
}

// Any trailing date, with or without a time (`-2026-05-22-1212`), for naming a group of runs
const DATE_SUFFIX = /[-_]\d{4}-\d{2}-\d{2}(?:[_T-]\d{2}-?\d{2}(?:-?\d{2})?)?$/;

type DatasetGroup = { key: string; label: string; size: number; preview: string; experiments: ExperimentWithStats[] };

function datasetPreview(dataset: unknown[]): string {
  const first = dataset[0];
  if (first == null) return "";
  return typeof first === "string" ? first : JSON.stringify(first);
}

/**
 * Runs on the same dataset share a group. Only the JSON's contents are stored, not its file name,
 * so a group is named after its most common run name. Groups keep the list's newest-first order.
 */
function groupByDataset(experiments: ExperimentWithStats[]): DatasetGroup[] {
  const groups = new Map<string, DatasetGroup>();
  for (const exp of experiments) {
    const dataset = Array.isArray(exp.dataset) ? exp.dataset : [];
    const key = JSON.stringify(dataset);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: "", size: dataset.length, preview: datasetPreview(dataset), experiments: [] };
      groups.set(key, group);
    }
    group.experiments.push(exp);
  }
  for (const group of groups.values()) {
    const counts = new Map<string, number>();
    for (const exp of group.experiments) {
      const name = exp.name.replace(DATE_SUFFIX, "") || exp.name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    group.label = [...counts].sort((x, y) => y[1] - x[1])[0][0];
  }
  return [...groups.values()];
}

function ExperimentItem({
  experiment,
  open,
  onToggle,
  onRename,
}: {
  experiment: ExperimentWithStats;
  open: boolean;
  onToggle: () => void;
  onRename: (id: string, name: string) => void;
}) {
  const { toggleExperiment, isExperimentSelected, isLastSelected } = useSelection();
  const selected = isExperimentSelected(experiment.id);
  const stalled = isStalled(experiment);
  const empty = experiment.trace_count === 0;

  async function handleToggle() {
    // Fetch trace IDs for this experiment so they get selected too
    const res = await fetch(`/api/experiments/${experiment.id}`);
    const traceIds: string[] = [];
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.traces)) {
        for (const t of data.traces) traceIds.push(t.id);
      }
    }
    toggleExperiment(experiment.id, traceIds);
  }

  return (
    <div
      onClick={(e) => {
        // Ignore the second click of a double-click (that renames) and clicks in the rename input
        if (e.detail > 1 || (e.target as HTMLElement).closest("input")) return;
        onToggle();
      }}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 transition-colors has-[[data-compare-toggle]:focus-visible]:ring-2 has-[[data-compare-toggle]:focus-visible]:ring-ring",
        open ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      {/* Keyboard and screen-reader way to open it; the row's click is a mouse shortcut */}
      <button
        type="button"
        data-compare-toggle
        aria-pressed={open}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="sr-only"
      >
        {open ? "Close" : "Compare"} {experiment.name}
      </button>
      {/* Export selection: out of the way until you hover, focus or check it */}
      <input
        type="checkbox"
        checked={selected}
        onChange={handleToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${experiment.name} for export`}
        className={cn(
          "mt-[3px] transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          isLastSelected(experiment.id) && "ring-1 ring-foreground ring-offset-1 ring-offset-background"
        )}
      />
      <div className={cn("min-w-0 flex-1 space-y-1", empty && !open && "opacity-60")}>
        <InlineEditName
          value={experiment.name}
          display={shortName(experiment.name)}
          onSave={(name) => onRename(experiment.id, name)}
          experimentId={experiment.id}
          className={cn("block min-w-0 truncate text-sm", open && "font-medium")}
        />
        <div className="text-xs text-muted-foreground" title={experiment.agent}>
          <RunStatus status={experiment.status} error={experiment.error} stalled={stalled} />
        </div>
      </div>
    </div>
  );
}

/** Status as an icon and a word, quiet enough to sit inline with the trace count. */
function RunStatus({
  status,
  error,
  stalled,
}: {
  status: ExperimentWithStats["status"];
  error?: string | null;
  stalled: boolean;
}) {
  if (status === "running" && !stalled) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <RoseLoader size={12} color="var(--muted-foreground)" /> running
      </span>
    );
  }
  const [label, Icon, iconClass, text, title]: [string, LucideIcon, string, string, string | undefined] = stalled
    ? ["stalled", Hourglass, "text-verdict-miss", "", STALLED_TITLE]
    : status === "failed"
      ? ["failed", CircleX, "", "text-destructive", error || "Experiment failed"]
      : status === "completed"
        ? ["completed", CircleCheck, "text-verdict-hit", "", undefined]
        : [status, CircleDashed, "", "", undefined];
  return (
    <span className={cn("inline-flex items-center gap-1.5", text)} title={title}>
      <Icon className={cn("size-3.5 shrink-0", iconClass)} aria-hidden />
      {label}
    </span>
  );
}

export function StatusBadge({
  status,
  error,
  stalled,
}: {
  status: ExperimentWithStats["status"];
  error?: string | null;
  stalled?: boolean;
}) {
  if (stalled) {
    return (
      <Badge variant="outline" title={STALLED_TITLE}>
        stalled
      </Badge>
    );
  }
  switch (status) {
    case "completed":
      return <Badge>completed</Badge>;
    case "failed":
      return (
        <Badge variant="destructive" title={error || "Experiment failed"}>
          failed
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1.5">
          <RoseLoader size={14} /> running
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function ComparisonArea({
  panels,
  view,
  readOnly,
  paused,
  pulsingPanelId,
  hoveredInputKey,
  onHoverInputKey,
  onClose,
  onRename,
  onTraceClick,
  onTagsSaved,
}: {
  panels: PanelData[];
  view: View;
  readOnly: boolean;
  paused: boolean;
  pulsingPanelId: string | null;
  hoveredInputKey: string | null;
  onHoverInputKey: (key: string | null) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onTraceClick: (trace: TraceWithLatestAnnotation) => void;
  onTagsSaved: (traceId: string, patch: AnnotationPatch) => void;
}) {
  // Compute alignment
  const aligned = computeAlignment(panels);

  return (
    <div
      className={cn(
        "flex-1 min-h-0 overflow-hidden rounded-lg border transition-colors",
        panels.length === 0 ? "border-border" : "border-transparent",
        panels.length === 0 && "flex items-center justify-center border-dashed"
      )}
    >
      {panels.length === 0 ? (
        <div className="text-center text-muted-foreground space-y-2">
          <div className="text-3xl">←</div>
          <p>Pick an experiment to read its conversations</p>
          <p className="text-xs">Pick two or more to compare replies side by side</p>
        </div>
      ) : view === "convo" ? (
        <ConvoView
          panels={panels}
          aligned={!aligned.mismatch}
          pulsingPanelId={pulsingPanelId}
          readOnly={readOnly}
          paused={paused}
          onClose={onClose}
          onRename={onRename}
          onTagsSaved={onTagsSaved}
          onOpenDetails={onTraceClick}
        />
      ) : (
        <div
          className="h-full grid gap-3 overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))` }}
        >
          {panels.map((panel) => (
            <ComparisonPanel
              key={panel.experiment.id}
              panel={panel}
              alignedKeys={aligned.mismatch ? null : aligned.keys}
              pulsing={pulsingPanelId === panel.experiment.id}
              hoveredInputKey={hoveredInputKey}
              onHoverInputKey={onHoverInputKey}
              onClose={() => onClose(panel.experiment.id)}
              onRename={(name) => onRename(panel.experiment.id, name)}
              onTraceClick={onTraceClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function stableInputKey(input: Record<string, unknown>): string {
  const sortedKeys = Object.keys(input).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of sortedKeys) sorted[k] = input[k];
  return JSON.stringify(sorted);
}

function datasetSignature(dataset: unknown[]): string {
  const items = (dataset as Array<Record<string, unknown>>).map((item) =>
    JSON.stringify(item)
  );
  return items.sort().join("|");
}

type AlignmentResult =
  | { mismatch: true }
  | { mismatch: false; keys: string[] };

function computeAlignment(panels: PanelData[]): AlignmentResult {
  if (panels.length < 2) {
    // Single panel: no alignment needed, just use trace order
    if (panels.length === 1) {
      return {
        mismatch: false,
        keys: panels[0].traces.map((t) => stableInputKey(t.input)),
      };
    }
    return { mismatch: false, keys: [] };
  }

  // Check if all datasets match
  const signatures = panels.map((p) => datasetSignature(p.experiment.dataset));
  const allMatch = signatures.every((s) => s === signatures[0]);

  if (!allMatch) return { mismatch: true };

  // Build union of input keys, ordered by first occurrence across all panels
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const panel of panels) {
    for (const trace of panel.traces) {
      const key = stableInputKey(trace.input);
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  return { mismatch: false, keys };
}
