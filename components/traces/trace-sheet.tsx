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
import { toast } from "sonner";
import type { TraceWithLatestAnnotation, Annotation } from "@/lib/db/types";
import { relativeTime, formatCost, formatLatency, cn } from "@/lib/utils";
import { extractExchange } from "@/lib/conversation";
import { isVerdict } from "@/lib/verdicts";
import { AnnotationForm } from "./annotation-form";
import { AnnotationBar } from "./annotation-bar";
import { TagPicker } from "./tag-picker";
import { AGENT_BUBBLE, USER_BUBBLE } from "./bubbles";
import { useSelection } from "@/lib/context/selection";

type CorrelationGroup = {
  key: string;
  type: string;
  value: string;
  traces: TraceWithLatestAnnotation[];
};

export type AnnotationPatch = Pick<
  TraceWithLatestAnnotation,
  "latest_rating" | "latest_reason" | "latest_tags" | "latest_annotation_at"
>;


function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT") {
    // Checkboxes and buttons don't take text; the sheet opens with focus on the select checkbox.
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset"].includes(type);
  }
  return tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function TraceSheet({
  trace,
  open,
  onOpenChange,
  onAnnotationSaved,
  onTagsSaved,
  traces,
  onNavigate,
  readOnly = false,
}: {
  trace: TraceWithLatestAnnotation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnnotationSaved: () => void;
  /** Called after tags or a note are saved so the parent can patch its row without refetching. */
  onTagsSaved?: (traceId: string, patch: AnnotationPatch) => void;
  traces?: TraceWithLatestAnnotation[];
  onNavigate?: (trace: TraceWithLatestAnnotation) => void;
  readOnly?: boolean;
}) {
  const { toggleTrace, isTraceSelected, isLastSelected } = useSelection();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationGroup[]>([]);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);

  // Navigation history for in-sheet trace browsing
  const [history, setHistory] = useState<TraceWithLatestAnnotation[]>([]);
  const [currentTrace, setCurrentTrace] = useState<TraceWithLatestAnnotation | null>(null);
  const [navigating, setNavigating] = useState(false);

  // Triage state
  const [note, setNote] = useState("");
  // Saved tags shown before the server confirms
  const [optimisticTags, setOptimisticTags] = useState<Record<string, string[]>>({});

  const activeTrace = currentTrace || trace;
  // Prefer the parent's copy of the row: it carries tags patched in after save.
  const liveTrace = activeTrace ? traces?.find((t) => t.id === activeTrace.id) ?? activeTrace : null;
  const tagsOf = (t: TraceWithLatestAnnotation) => optimisticTags[t.id] ?? t.latest_tags ?? [];
  // Old hit/miss/cringe tags stay in the data but never show
  const visibleTagsOf = (t: TraceWithLatestAnnotation) => tagsOf(t).filter((tag) => !isVerdict(tag));
  const visibleTags = liveTrace ? visibleTagsOf(liveTrace) : [];

  const taggedCount = traces ? traces.filter((t) => visibleTagsOf(t).length > 0).length : 0;

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
      setNote(trace.latest_reason ?? "");
      fetchTraceData(trace);
    } else if (!open) {
      setAnnotations([]);
      setCorrelations([]);
      setCurrentTrace(null);
      setHistory([]);
      setNote("");
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

  /** Save tags with the current note. */
  const saveAnnotation = useCallback(
    (tags: string[]) => {
      if (!liveTrace || readOnly) return;
      const traceId = liveTrace.id;
      const reason = note.trim() || null;
      const rating = liveTrace.latest_rating;

      setOptimisticTags((prev) => ({ ...prev, [traceId]: tags }));

      fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: traceId,
          rating: rating ?? undefined,
          reason: reason ?? undefined,
          tags,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to save");
          }
          onTagsSaved?.(traceId, {
            latest_tags: tags,
            latest_reason: reason,
            latest_rating: rating,
            latest_annotation_at: new Date().toISOString(),
          });
        })
        .catch((err: Error) => {
          setOptimisticTags((prev) => {
            const next = { ...prev };
            delete next[traceId];
            return next;
          });
          toast.error(err.message);
        });
    },
    [liveTrace, readOnly, note, onTagsSaved]
  );

  function saveNoteIfChanged() {
    if (!liveTrace) return;
    if (note.trim() === (liveTrace.latest_reason ?? "").trim()) return;
    saveAnnotation(tagsOf(liveTrace));
  }

  function setVisibleTags(next: string[]) {
    if (!liveTrace) return;
    saveAnnotation([...next, ...tagsOf(liveTrace).filter(isVerdict)]);
  }

  // Keyboard: ← → flip through traces
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && traces && traces.length > 0) {
        e.preventDefault();
        const currentId = activeTrace?.id;
        const idx = traces.findIndex((t) => t.id === currentId);
        if (idx === -1) return;

        const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= traces.length) return;

        onNavigate?.(traces[nextIdx]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, traces, activeTrace, onNavigate]);

  const exchange = activeTrace ? extractExchange(activeTrace) : null;

  // The Sheet stays mounted with no trace so its first open animates in like the rest
  return (
    <Sheet open={open && Boolean(liveTrace)} onOpenChange={onOpenChange}>
      <SheetContent className="w-[70vw] sm:max-w-[70vw] p-0 max-sm:w-full">
        {activeTrace && liveTrace && exchange && (
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
                    aria-label="Select trace"
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
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {activeTrace.created_at}
                </p>
                {traces && traces.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    · {traces.findIndex((t) => t.id === activeTrace.id) + 1} of {traces.length} <span className="opacity-50">← →</span>
                  </span>
                )}
                {traces && traces.length > 0 && (
                  <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                    {taggedCount} tagged · {traces.length - taggedCount} left
                  </span>
                )}
              </div>
            </SheetHeader>

            <div
              key={activeTrace.id}
              className="space-y-6"
            >
              <AnnotationBar
                note={note}
                onNoteChange={setNote}
                onSubmitNote={saveNoteIfChanged}
                disabled={readOnly}
                disabledReason="Read-only demo"
                actions={
                  <TagPicker
                    value={visibleTags}
                    onChange={setVisibleTags}
                    disabled={readOnly}
                    label={visibleTags.length > 0 ? `Tags · ${visibleTags.length}` : "+ Tag"}
                  />
                }
              />

              {navigating && (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              )}

              {!navigating && (
                <>
                  {exchange.userTurns.length > 0 ? (
                    <div className="space-y-3">
                      {exchange.userTurns.map((turn, i) => (
                        <div key={i} className="flex justify-end">
                          <p className={USER_BUBBLE}>
                            {turn || <span className="italic">(empty message)</span>}
                          </p>
                        </div>
                      ))}
                      <p className={AGENT_BUBBLE}>{exchange.reply}</p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Output</h3>
                      <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap max-h-96">
                        {activeTrace.output}
                      </pre>
                    </div>
                  )}

                  <Separator />

                  <details className="group" open={exchange.userTurns.length === 0}>
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                      Raw input
                    </summary>
                    <pre className="mt-2 text-xs font-mono bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap max-h-96">
                      {JSON.stringify(activeTrace.input, null, 2)}
                    </pre>
                  </details>

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
                      disabled={readOnly}
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
          </div>
        </ScrollArea>
        )}
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
