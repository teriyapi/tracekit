"use client";

import { useMemo } from "react";
import { RoseLoader } from "@/components/ui/rose-loader";
import { useConvoTriage } from "@/components/traces/convo-triage";
import type { AnnotationPatch } from "@/components/traces/trace-sheet";
import type { ExperimentWithStats, TraceWithLatestAnnotation } from "@/lib/db/types";
import { isStalled, STALLED_TITLE } from "@/lib/experiments";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./comparison-panel";

type PanelData = {
  experiment: ExperimentWithStats;
  traces: TraceWithLatestAnnotation[];
};

/** One prompt and each experiment's reply to it; a cell is null when that experiment has no trace for the prompt. */
type ConvoRow = { id: string; cells: (TraceWithLatestAnnotation | null)[] };

function stableInputKey(input: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(input).sort()) sorted[k] = input[k];
  return JSON.stringify(sorted);
}

/**
 * Line up replies to the same input across experiments. Repeats of one input
 * within an experiment get their own rows (#0, #1, …) instead of collapsing.
 */
function alignRows(panels: PanelData[]): ConvoRow[] {
  const order: string[] = [];
  const byId = new Map<string, (TraceWithLatestAnnotation | null)[]>();
  panels.forEach((panel, col) => {
    const seen = new Map<string, number>();
    for (const trace of panel.traces) {
      const key = stableInputKey(trace.input);
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const id = `${key}#${n}`;
      if (!byId.has(id)) {
        byId.set(id, panels.map(() => null));
        order.push(id);
      }
      byId.get(id)![col] = trace;
    }
  });
  return order.map((id) => ({ id, cells: byId.get(id)! }));
}

/**
 * Experiments as conversations. Click a reply to open it and tag it in place.
 * With several experiments on the same dataset, replies to one prompt sit side by side.
 */
export function ConvoView({
  panels,
  aligned,
  pulsingPanelId,
  readOnly,
  paused,
  onClose,
  onRename,
  onTagsSaved,
  onOpenDetails,
}: {
  panels: PanelData[];
  /** False when the datasets differ, so each experiment scrolls as its own column. */
  aligned: boolean;
  pulsingPanelId: string | null;
  readOnly: boolean;
  /** True while the trace sheet is open, so its keys win. */
  paused: boolean;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onTagsSaved: (traceId: string, patch: AnnotationPatch) => void;
  onOpenDetails: (trace: TraceWithLatestAnnotation) => void;
}) {
  const rows = useMemo(() => (aligned ? alignRows(panels) : []), [aligned, panels]);

  // Tagging order: across a row first, so side-by-side replies get rated together
  const order = useMemo(() => {
    const traces = aligned
      ? rows.flatMap((r) => r.cells.filter((c): c is TraceWithLatestAnnotation => c !== null))
      : panels.flatMap((p) => p.traces);
    return traces;
  }, [aligned, rows, panels]);

  const { cursor, setCursor, renderTurn, taggedCount } = useConvoTriage({
    order,
    readOnly,
    paused,
    onTagsSaved,
    onOpenDetails,
  });

  const openRowId = aligned && cursor ? rows.find((r) => r.cells.some((c) => c?.id === cursor))?.id ?? null : null;

  function columnStatus(panel: PanelData) {
    const { experiment, traces } = panel;
    if (experiment.status === "failed") {
      return (
        <p className="truncate px-3 py-1 text-xs text-destructive" title={experiment.error || undefined}>
          Failed{traces.length > 0 ? ` at ${traces.length} of ${experiment.dataset?.length ?? "?"}` : ""}: {experiment.error || "unknown error"}
        </p>
      );
    }
    if (experiment.status === "pending" || experiment.status === "running") {
      return (
        <p className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
          {isStalled(experiment) ? (
            STALLED_TITLE
          ) : (
            <>
              <RoseLoader size={12} color="var(--muted-foreground)" />
              {traces.length} of {experiment.dataset?.length ?? "?"} traces…
            </>
          )}
        </p>
      );
    }
    return null;
  }

  const empty = order.length === 0;

  function renderHeader(panel: PanelData) {
    return (
      <div
        className={cn(
          "sticky top-0 z-10 rounded-t-lg bg-card",
          pulsingPanelId === panel.experiment.id && "animate-pulse"
        )}
      >
        <PanelHeader
          experiment={panel.experiment}
          traceCount={panel.traces.length}
          onClose={() => onClose(panel.experiment.id)}
          onRename={(name) => onRename(panel.experiment.id, name)}
        />
        {columnStatus(panel)}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* One window per experiment. On a shared dataset the windows share row tracks (subgrid), so a prompt lines up across them */}
        <div
          className="grid items-start gap-3"
          style={{
            gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))`,
            gridTemplateRows: aligned ? `auto repeat(${Math.max(rows.length, 1)}, auto)` : undefined,
          }}
        >
          {panels.map((panel, col) => (
            <div
              key={panel.experiment.id}
              className={cn(
                "min-w-0 rounded-lg border bg-card",
                aligned ? "grid grid-rows-subgrid" : "flex flex-col"
              )}
              style={aligned ? { gridRow: `1 / span ${Math.max(rows.length, 1) + 1}` } : undefined}
            >
              {renderHeader(panel)}
              {empty ? (
                <div className="flex items-center justify-center gap-2 px-3 py-16 text-sm text-muted-foreground">
                  <RoseLoader size={16} /> Waiting for traces…
                </div>
              ) : aligned ? (
                rows.map((row) => {
                  const cell = row.cells[col];
                  const expanded = row.id === openRowId;
                  if (!cell) {
                    return (
                      <p key={row.id} className="border-b px-3 py-4 text-xs italic text-muted-foreground last:border-b-0">
                        (no reply)
                      </p>
                    );
                  }
                  return (
                    <div key={row.id} className="min-w-0 border-b p-1.5 last:rounded-b-lg last:border-b-0">
                      {renderTurn(cell, expanded, () => setCursor(expanded ? null : cell.id))}
                    </div>
                  );
                })
              ) : (
                panel.traces.map((trace) => (
                  <div key={trace.id} className="min-w-0 border-b p-1.5 last:rounded-b-lg last:border-b-0">
                    {renderTurn(trace, cursor === trace.id, () => setCursor(cursor === trace.id ? null : trace.id))}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-1 font-mono text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {taggedCount} tagged · {order.length - taggedCount} left
        </span>
        {!aligned && panels.length > 1 && <span>datasets differ, so rows aren&apos;t lined up</span>}
        <span className="ml-auto">click a reply · ← → move · esc close</span>
      </div>
    </div>
  );
}
