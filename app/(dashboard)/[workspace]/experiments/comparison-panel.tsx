"use client";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { RoseLoader } from "@/components/ui/rose-loader";
import type { ExperimentWithStats, TraceWithLatestAnnotation } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { InlineEditName } from "./inline-edit-name";
import { useSelection } from "@/lib/context/selection";

type PanelData = {
  experiment: ExperimentWithStats;
  traces: TraceWithLatestAnnotation[];
};

function stableInputKey(input: Record<string, unknown>): string {
  const sortedKeys = Object.keys(input).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of sortedKeys) sorted[k] = input[k];
  return JSON.stringify(sorted);
}

export function ComparisonPanel({
  panel,
  alignedKeys,
  pulsing,
  hoveredInputKey,
  onHoverInputKey,
  onClose,
  onRename,
  onTraceClick,
}: {
  panel: PanelData;
  alignedKeys: string[] | null;
  pulsing: boolean;
  hoveredInputKey: string | null;
  onHoverInputKey: (key: string | null) => void;
  onClose: () => void;
  onRename: (name: string) => void;
  onTraceClick: (trace: TraceWithLatestAnnotation) => void;
}) {
  const { experiment, traces } = panel;
  const { toggleTrace, isTraceSelected, isLastSelected } = useSelection();

  // Build rows based on alignment
  const rows = buildRows(traces, alignedKeys);

  return (
    <div
      className={cn(
        "border rounded-md flex flex-col min-h-0 overflow-hidden transition-all",
        pulsing && "animate-pulse ring-2 ring-primary"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <InlineEditName
            value={experiment.name}
            onSave={onRename}
            experimentId={experiment.id}
            className="text-sm font-medium"
          />
          <StatusBadge status={experiment.status} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="shrink-0 ml-2"
        >
          ✕
        </Button>
      </div>

      {/* Stats */}
      <div className="px-3 py-1 text-xs text-muted-foreground border-b shrink-0">
        {traces.length} rows{(experiment.status === "running" || experiment.status === "pending") && experiment.dataset?.length ? ` / ${experiment.dataset.length}` : ""}
        {experiment.computed_avg_rating != null && ` • avg ${experiment.computed_avg_rating.toFixed(1)}`}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {(experiment.status === "pending" || experiment.status === "running") && traces.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RoseLoader size={20} className="mr-2" />
            {experiment.status === "running" ? "Running…" : "Pending…"}
          </div>
        ) : experiment.status === "failed" && traces.length === 0 ? (
          <div className="p-3">
            <Alert variant="destructive">
              <AlertTitle>Experiment failed</AlertTitle>
              <AlertDescription className="mt-1 break-words">{experiment.error || "Unknown error"}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-popover">
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead className="w-14">Rating</TableHead>
                  <TableHead className="w-24">Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  if (!row.trace) {
                    return (
                      <TableRow
                        key={`empty-${idx}`}
                        className={cn("opacity-40", hoveredInputKey === row.key && "bg-muted/50")}
                        onMouseEnter={() => onHoverInputKey(row.key)}
                        onMouseLeave={() => onHoverInputKey(null)}
                      >
                        <TableCell></TableCell>
                        <TableCell colSpan={3} className="text-xs text-muted-foreground italic">
                          (no trace)
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    );
                  }
                  const trace = row.trace;
                  return (
                    <TableRow
                      key={trace.id}
                      className={cn(
                        "cursor-pointer",
                        hoveredInputKey === row.key ? "bg-muted/50" : "hover:bg-muted/50"
                      )}
                      onMouseEnter={() => onHoverInputKey(row.key)}
                      onMouseLeave={() => onHoverInputKey(null)}
                      onClick={() => onTraceClick(trace)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isTraceSelected(trace.id)}
                          onChange={() => toggleTrace(trace.id)}
                          className={cn(isLastSelected(trace.id) && "ring-1 ring-foreground ring-offset-1 ring-offset-background")}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-32 truncate">
                        {getInputPreview(trace.input, 60)}
                      </TableCell>
                      <TableCell className="text-xs max-w-48">
                        <div className="line-clamp-3">{trace.output}</div>
                      </TableCell>
                      <TableCell>
                        {trace.latest_rating ? (
                          <Badge variant="outline">{trace.latest_rating}★</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-0.5 flex-wrap">
                          {(trace.latest_tags || []).slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                          {(trace.latest_tags || []).length > 2 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{(trace.latest_tags || []).length - 2}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(experiment.status === "running" || experiment.status === "pending") && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                        <RoseLoader size={14} color="var(--muted-foreground)" />
                        {traces.length} of {experiment.dataset?.length ?? "?"} traces…
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {experiment.status === "failed" && traces.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <Alert variant="destructive" className="rounded-none border-x-0 border-b-0">
                        <AlertTitle>Failed at {traces.length} of {experiment.dataset?.length ?? "?"} traces</AlertTitle>
                        <AlertDescription className="mt-1 break-words text-xs">
                          {experiment.error || "Unknown error"}
                        </AlertDescription>
                      </Alert>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ExperimentWithStats["status"] }) {
  switch (status) {
    case "completed":
      return <Badge className="text-[10px]">completed</Badge>;
    case "failed":
      return <Badge variant="destructive" className="text-[10px]">failed</Badge>;
    case "running":
      return <Badge variant="secondary" className="text-[10px]">running</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  }
}

type RowData = { trace: TraceWithLatestAnnotation | null; key: string };

function buildRows(
  traces: TraceWithLatestAnnotation[],
  alignedKeys: string[] | null
): RowData[] {
  if (!alignedKeys) {
    // No alignment — just render traces in order
    return traces.map((t) => ({ trace: t, key: t.id }));
  }

  // Build a map of input key → trace
  const traceByKey = new Map<string, TraceWithLatestAnnotation>();
  for (const trace of traces) {
    const key = stableInputKey(trace.input);
    traceByKey.set(key, trace);
  }

  return alignedKeys.map((key) => ({
    trace: traceByKey.get(key) || null,
    key,
  }));
}

function getInputPreview(input: Record<string, unknown>, maxLen: number): string {
  if (input.user_message && typeof input.user_message === "string") {
    return input.user_message.slice(0, maxLen);
  }
  const firstValue = Object.values(input)[0];
  if (typeof firstValue === "string") return firstValue.slice(0, maxLen);
  return JSON.stringify(firstValue).slice(0, maxLen);
}
