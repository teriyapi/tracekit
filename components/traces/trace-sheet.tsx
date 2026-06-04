"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import type { TraceWithLatestAnnotation, Annotation } from "@/lib/db/types";
import { relativeTime, formatCost, formatLatency, cn } from "@/lib/utils";
import { AnnotationForm } from "./annotation-form";
import { useSelection } from "@/lib/context/selection";

type CorrelationGroup = {
  key: string;
  type: string;
  value: string;
  traces: TraceWithLatestAnnotation[];
};

export function TraceSheet({
  trace,
  open,
  onOpenChange,
  onAnnotationSaved,
  traces,
  onNavigate,
}: {
  trace: TraceWithLatestAnnotation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnnotationSaved: () => void;
  traces?: TraceWithLatestAnnotation[];
  onNavigate?: (trace: TraceWithLatestAnnotation) => void;
}) {
  const { toggleTrace, isTraceSelected, isLastSelected } = useSelection();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationGroup[]>([]);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);

  // Navigation history for in-sheet trace browsing
  const [history, setHistory] = useState<TraceWithLatestAnnotation[]>([]);
  const [currentTrace, setCurrentTrace] = useState<TraceWithLatestAnnotation | null>(null);
  const [navigating, setNavigating] = useState(false);

  const activeTrace = currentTrace || trace;

  const fetchTraceData = useCallback(
    (t: TraceWithLatestAnnotation) => {
      // Fetch annotations
      fetch(`/api/annotations/${t.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setAnnotations(data);
        });

      // Fetch related traces
      setCorrelationsLoading(true);
      fetch(`/api/traces/${t.id}/related`)
        .then((r) => r.json())
        .then((data) => {
          if (data.correlations && Array.isArray(data.correlations)) {
            setCorrelations(data.correlations);
          } else {
            setCorrelations([]);
          }
        })
        .catch(() => setCorrelations([]))
        .finally(() => setCorrelationsLoading(false));
    },
    []
  );

  // When sheet opens with a new trace from the table
  useEffect(() => {
    if (trace && open) {
      setCurrentTrace(null);
      setHistory([]);
      setAnnotations([]);
      setCorrelations([]);
      fetchTraceData(trace);
    } else if (!open) {
      setAnnotations([]);
      setCorrelations([]);
      setCurrentTrace(null);
      setHistory([]);
    }
  }, [trace, open, fetchTraceData]);

  function handleSaved() {
    if (activeTrace) {
      fetch(`/api/annotations/${activeTrace.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setAnnotations(data);
        });
    }
    onAnnotationSaved();
  }

  async function navigateToTrace(targetId: string) {
    if (!activeTrace) return;
    setNavigating(true);

    try {
      const res = await fetch(`/api/traces/${targetId}`);
      if (!res.ok) return;
      const newTrace = (await res.json()) as TraceWithLatestAnnotation;

      // Push current trace onto history
      setHistory((prev) => [...prev, activeTrace]);
      setCurrentTrace(newTrace);
      setAnnotations([]);
      setCorrelations([]);
      fetchTraceData(newTrace);
    } finally {
      setNavigating(false);
    }
  }

  function navigateBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentTrace(prev);
    setAnnotations([]);
    setCorrelations([]);
    fetchTraceData(prev);
  }

  // Keyboard navigation: arrow keys to flip through traces, Esc to close
  useEffect(() => {
    if (!open || !traces || traces.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const currentId = activeTrace?.id;
        const idx = traces!.findIndex((t) => t.id === currentId);
        if (idx === -1) return;

        const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= traces!.length) return;

        const nextTrace = traces![nextIdx];
        if (onNavigate) {
          onNavigate(nextTrace);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, traces, activeTrace, onNavigate]);

  if (!activeTrace) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[70vw] sm:max-w-[70vw] p-0">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                {history.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={navigateBack}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                )}
                <label
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isTraceSelected(activeTrace.id)}
                    onChange={() => toggleTrace(activeTrace.id)}
                    className={cn(
                      isLastSelected(activeTrace.id) &&
                        "ring-1 ring-foreground ring-offset-1 ring-offset-background"
                    )}
                  />
                </label>
                <Badge variant="secondary">{activeTrace.agent}</Badge>
                <span className="text-sm font-normal text-muted-foreground">
                  {relativeTime(activeTrace.created_at)}
                </span>
              </SheetTitle>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {activeTrace.created_at}
                </p>
                {traces && traces.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    · {traces.findIndex((t) => t.id === activeTrace.id) + 1} of {traces.length} <span className="opacity-50">← →</span>
                  </span>
                )}
              </div>
            </SheetHeader>

            {navigating && (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {!navigating && (
              <>
                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-2">Input</h3>
                  <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap max-h-96">
                    {JSON.stringify(activeTrace.input, null, 2)}
                  </pre>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Output</h3>
                  <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap max-h-96">
                    {activeTrace.output}
                  </pre>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Metadata</h3>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div>
                      <span className="text-muted-foreground">Model: </span>
                      <span>{activeTrace.model || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Latency: </span>
                      <span>{formatLatency(activeTrace.latency_ms)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost: </span>
                      <span>{formatCost(activeTrace.cost_usd)}</span>
                    </div>
                  </div>
                  {Object.keys(activeTrace.metadata || {}).length > 0 && (
                    <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap max-h-96">
                      {JSON.stringify(activeTrace.metadata, null, 2)}
                    </pre>
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-3">Annotate</h3>
                  <AnnotationForm
                    traceId={activeTrace.id}
                    latestAnnotation={annotations[0] || null}
                    onSaved={handleSaved}
                  />
                </div>

                {annotations.length > 0 && (
                  <div>
                    <Separator className="mb-4" />
                    <h3 className="text-sm font-medium mb-3">
                      Annotation History
                    </h3>
                    <div className="space-y-3">
                      {annotations.map((ann) => (
                        <div
                          key={ann.id}
                          className="text-xs border rounded-md p-3 space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            {ann.rating && (
                              <Badge variant="outline">{ann.rating}★</Badge>
                            )}
                            <span className="text-muted-foreground">
                              {relativeTime(ann.created_at)}
                            </span>
                          </div>
                          {ann.reason && (
                            <p className="text-muted-foreground">
                              {ann.reason}
                            </p>
                          )}
                          {ann.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {ann.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Traces */}
                <RelatedTraces
                  correlations={correlations}
                  loading={correlationsLoading}
                  onTraceClick={navigateToTrace}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function RelatedTraces({
  correlations,
  loading,
  onTraceClick,
}: {
  correlations: CorrelationGroup[];
  loading: boolean;
  onTraceClick: (id: string) => void;
}) {
  if (loading) {
    return (
      <div>
        <Separator className="mb-4" />
        <h3 className="text-sm font-medium mb-3">Related Traces</h3>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (correlations.length === 0) return null;

  return (
    <div>
      <Separator className="mb-4" />
      <h3 className="text-sm font-medium mb-3">Related Traces</h3>
      <div className="space-y-4">
        {correlations.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium">
                By {group.type.charAt(0).toUpperCase() + group.type.slice(1)}
              </span>
              <span
                className="text-xs font-mono text-muted-foreground max-w-[10ch] overflow-hidden text-ellipsis whitespace-nowrap"
                title={group.value}
              >
                {group.value}
              </span>
            </div>
            <div className="border rounded-md divide-y">
              {group.traces.map((t) => {
                const label =
                  (t.metadata as Record<string, unknown>)?.call_site ??
                  t.model ??
                  "—";
                const outputPreview =
                  t.output.length > 60
                    ? t.output.slice(0, 60) + "…"
                    : t.output;
                return (
                  <button
                    key={t.id}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => onTraceClick(t.id)}
                  >
                    <span className="font-medium shrink-0 w-24 truncate">
                      {String(label)}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">
                      {outputPreview}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {relativeTime(t.created_at)}
                    </span>
                    {t.latest_rating && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {t.latest_rating}★
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
