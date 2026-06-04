"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ExperimentWithStats, TraceWithLatestAnnotation } from "@/lib/db/types";
import { relativeTime, cn } from "@/lib/utils";
import { ComparisonPanel } from "./comparison-panel";
import { InlineEditName } from "./inline-edit-name";
import { TraceSheet } from "@/components/traces/trace-sheet";
import { useSelection } from "@/lib/context/selection";
import { NewExperimentModal } from "./new-experiment-modal";
import { RoseLoader } from "@/components/ui/rose-loader";

type PanelData = {
  experiment: ExperimentWithStats;
  traces: TraceWithLatestAnnotation[];
};

export function ExperimentsTabClient({
  initialExperiments,
  workspace,
}: {
  initialExperiments: ExperimentWithStats[];
  workspace: string;
}) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pulsingPanelId, setPulsingPanelId] = useState<string | null>(null);
  const [hoveredInputKey, setHoveredInputKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const selection = useSelection();

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

  function handleDragStart(event: DragStartEvent) {
    setDraggedId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggedId(null);
    if (!event.over) return;

    const expId = event.active.id as string;

    // Already open?
    if (panels.some((p) => p.experiment.id === expId)) {
      setPulsingPanelId(expId);
      setTimeout(() => setPulsingPanelId(null), 600);
      return;
    }

    // Max 4 panels
    if (panels.length >= 4) {
      toast.error("Maximum 4 panels. Close one to add another.");
      return;
    }

    // Fetch experiment data
    const res = await fetch(`/api/experiments/${expId}`);
    if (!res.ok) {
      toast.error("Failed to load experiment");
      return;
    }
    const data = await res.json();
    setPanels((prev) => [...prev, { experiment: data.experiment, traces: data.traces }]);
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

  const draggedExperiment = draggedId
    ? experiments.find((e) => e.id === draggedId)
    : null;

  return (
    <DndContext id="experiments-dnd" onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-7rem)]">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Experiments</h2>
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            + New Experiment
          </Button>
        </div>

        {/* Experiments list (top region) */}
        <div className="border rounded-md mb-4 shrink-0 max-h-48 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Agent</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-16">Traces</TableHead>
                  <TableHead className="w-20">Avg Rating</TableHead>
                  <TableHead className="w-24">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experiments.map((exp) => (
                  <DraggableRow key={exp.id} experiment={exp} onRename={handleRename} />
                ))}
                {experiments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No experiments yet. Use the SDK to run experiments.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
        </div>

        {/* Drop zone — comparison panels */}
        <DropZone
          panels={panels}
          experiments={experiments}
          pulsingPanelId={pulsingPanelId}
          hoveredInputKey={hoveredInputKey}
          onHoverInputKey={setHoveredInputKey}
          onClose={closePanel}
          onRename={handleRename}
          onTraceClick={handleTraceClick}
        />
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {draggedExperiment && (
          <div className="bg-popover border rounded-md px-3 py-2 shadow-lg text-sm">
            {draggedExperiment.name}
          </div>
        )}
      </DragOverlay>

      {/* Shared trace sheet */}
      <TraceSheet
        trace={sheetTrace}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAnnotationSaved={handleAnnotationSaved}
        traces={panels.flatMap((p) => p.traces)}
        onNavigate={(t) => { setSheetTrace(t); }}
      />

      {/* New experiment modal */}
      <NewExperimentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleExperimentCreated}
      />
    </DndContext>
  );
}

function DraggableRow({
  experiment,
  onRename,
}: {
  experiment: ExperimentWithStats;
  onRename: (id: string, name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: experiment.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const { toggleExperiment, isExperimentSelected, isLastSelected } = useSelection();

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
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50")}
    >
      <TableCell>
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground"
        >
          ⠿
        </span>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isExperimentSelected(experiment.id)}
          onChange={handleToggle}
          className={cn(isLastSelected(experiment.id) && "ring-1 ring-foreground ring-offset-1 ring-offset-background")}
        />
      </TableCell>
      <TableCell>
        <InlineEditName
          value={experiment.name}
          onSave={(name) => onRename(experiment.id, name)}
          experimentId={experiment.id}
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{experiment.agent}</Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={experiment.status} error={experiment.error} />
      </TableCell>
      <TableCell className="text-xs">{experiment.trace_count}</TableCell>
      <TableCell className="text-xs">
        {experiment.computed_avg_rating != null
          ? experiment.computed_avg_rating.toFixed(1)
          : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {relativeTime(experiment.created_at)}
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status, error }: { status: ExperimentWithStats["status"]; error?: string | null }) {
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

function DropZone({
  panels,
  experiments,
  pulsingPanelId,
  hoveredInputKey,
  onHoverInputKey,
  onClose,
  onRename,
  onTraceClick,
}: {
  panels: PanelData[];
  experiments: ExperimentWithStats[];
  pulsingPanelId: string | null;
  hoveredInputKey: string | null;
  onHoverInputKey: (key: string | null) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onTraceClick: (trace: TraceWithLatestAnnotation) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "comparison-drop-zone" });

  // Compute alignment
  const aligned = computeAlignment(panels);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-h-0 border-2 border-dashed rounded-lg transition-colors",
        isOver ? "border-primary bg-primary/5" : "border-border",
        panels.length === 0 && "flex items-center justify-center"
      )}
    >
      {panels.length === 0 ? (
        <div className="text-center text-muted-foreground space-y-2">
          <div className="text-3xl">↑</div>
          <p>Drag an experiment from above to start comparing</p>
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-hidden">
          <div
            className="flex-1 min-h-0 grid gap-2 p-2 overflow-hidden"
            style={{ gridTemplateColumns: `repeat(${panels.length}, 1fr)` }}
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
