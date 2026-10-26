"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnnotationBar } from "@/components/traces/annotation-bar";
import { TagPicker } from "@/components/traces/tag-picker";
import { AGENT_BUBBLE, USER_BUBBLE } from "@/components/traces/bubbles";
import type { AnnotationPatch } from "@/components/traces/trace-sheet";
import type { TraceWithLatestAnnotation } from "@/lib/db/types";
import { extractExchange } from "@/lib/conversation";
import { isVerdict } from "@/lib/verdicts";
import { cn } from "@/lib/utils";

function userTurnsFor(trace: TraceWithLatestAnnotation): string[] {
  const { userTurns } = extractExchange(trace);
  return userTurns.length > 0 ? userTurns : [JSON.stringify(trace.input)];
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "INPUT") {
    return !["checkbox", "radio", "button", "submit", "reset"].includes((el as HTMLInputElement).type);
  }
  return el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * Conversation triage shared by the convo views: click a reply to open it, tag it in place,
 * ← → move through `order`, esc or a click outside closes it.
 */
export function useConvoTriage({
  order,
  readOnly,
  paused,
  onTagsSaved,
  onOpenDetails,
}: {
  /** Every trace on screen, in the order ← → walks them. */
  order: TraceWithLatestAnnotation[];
  readOnly: boolean;
  /** True while the trace sheet is open, so its keys win. */
  paused: boolean;
  onTagsSaved: (traceId: string, patch: AnnotationPatch) => void;
  onOpenDetails: (trace: TraceWithLatestAnnotation) => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Saved tags shown before the server confirms
  const [optimistic, setOptimistic] = useState<Record<string, string[]>>({});
  const cellRefs = useRef(new Map<string, HTMLDivElement>());

  const cursorTrace = cursor ? order.find((t) => t.id === cursor) ?? null : null;

  const tagsOf = (t: TraceWithLatestAnnotation) => optimistic[t.id] ?? t.latest_tags ?? [];
  // Old hit/miss/cringe tags stay in the data but never show
  const visibleTagsOf = (t: TraceWithLatestAnnotation) => tagsOf(t).filter((tag) => !isVerdict(tag));
  const noteFor = (t: TraceWithLatestAnnotation) => notes[t.id] ?? t.latest_reason ?? "";
  const taggedCount = order.filter((t) => visibleTagsOf(t).length > 0).length;

  useEffect(() => {
    if (!cursor) return;
    cellRefs.current.get(cursor)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  // Clicking anywhere outside the open reply closes it. Popovers render in a portal, so they count as inside.
  useEffect(() => {
    if (!cursor || paused) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.isConnected) return;
      if (target.closest("[data-convo-open], [data-slot=popover-content], [role=dialog], [data-sonner-toaster]")) return;
      setCursor(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [cursor, paused]);

  const step = useCallback(
    (from: string, delta: number) => {
      const idx = order.findIndex((t) => t.id === from);
      const next = order[idx + delta];
      if (idx !== -1 && next) setCursor(next.id);
    },
    [order]
  );

  /** Save tags with the reply's current note. */
  const saveAnnotation = useCallback(
    (trace: TraceWithLatestAnnotation, tags: string[]) => {
      if (readOnly) return;
      const traceId = trace.id;
      const reason = (notes[traceId] ?? trace.latest_reason ?? "").trim() || null;
      const rating = trace.latest_rating;

      setOptimistic((prev) => ({ ...prev, [traceId]: tags }));

      fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trace_id: traceId, rating: rating ?? undefined, reason: reason ?? undefined, tags }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to save");
          }
          onTagsSaved(traceId, {
            latest_tags: tags,
            latest_reason: reason,
            latest_rating: rating,
            latest_annotation_at: new Date().toISOString(),
          });
        })
        .catch((err: Error) => {
          setOptimistic((prev) => {
            const next = { ...prev };
            delete next[traceId];
            return next;
          });
          toast.error(err.message);
        });
    },
    [readOnly, notes, onTagsSaved]
  );

  function setVisibleTags(trace: TraceWithLatestAnnotation, next: string[]) {
    saveAnnotation(trace, [...next, ...tagsOf(trace).filter(isVerdict)]);
  }

  function saveNoteIfChanged(trace: TraceWithLatestAnnotation) {
    if (noteFor(trace).trim() === (trace.latest_reason ?? "").trim()) return;
    saveAnnotation(trace, tagsOf(trace));
  }

  // Keyboard: ← → move between replies, esc closes
  useEffect(() => {
    if (paused || !cursorTrace) return;
    const current = cursorTrace;

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        step(current.id, 1);
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        step(current.id, -1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setCursor(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paused, cursorTrace, step]);

  /** One prompt and its reply. The whole turn highlights when open; the details link sits in its top-right corner. */
  function renderTurn(trace: TraceWithLatestAnnotation, expanded: boolean, onToggle: () => void) {
    const active = trace.id === cursor;
    const { reply, userTurns } = extractExchange(trace);
    const tags = visibleTagsOf(trace);
    const text = <p className={cn(userTurns.length === 0 && "font-mono text-xs")}>{userTurns.length > 0 ? reply : trace.output}</p>;
    const hasMeta = Boolean(trace.latest_rating || tags.length > 0);

    return (
      <div
        ref={(el) => {
          if (el) cellRefs.current.set(trace.id, el);
          else cellRefs.current.delete(trace.id);
        }}
        data-convo-open={expanded ? "" : undefined}
        onClick={() => setCursor(trace.id)}
        className={cn(
          "h-full scroll-mt-14 scroll-mb-4 space-y-2 rounded-lg p-3 transition-colors",
          active ? "bg-muted/40" : expanded ? "bg-muted/15" : "cursor-pointer hover:bg-muted/20"
        )}
      >
        {expanded && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(trace);
              }}
              className="text-muted-foreground"
            >
              <Maximize2 data-icon="inline-start" aria-hidden /> details
            </Button>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-expanded={expanded}
          className="flex w-full flex-col items-end gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {userTurnsFor(trace).map((turn, i, all) => (
            <p key={i} className={cn(USER_BUBBLE, i < all.length - 1 && "opacity-70")}>
              {turn || <span className="italic">(empty message)</span>}
            </p>
          ))}
        </button>
        {hasMeta && (
          <div className="flex flex-wrap items-center gap-1">
            {trace.latest_rating ? (
              <Badge variant="outline" aria-label={`Rated ${trace.latest_rating} out of 5`}>
                {trace.latest_rating}★
              </Badge>
            ) : null}
            {tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {expanded ? (
          <div className={AGENT_BUBBLE}>{text}</div>
        ) : (
          // A real button so keyboard users can open a reply too
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setCursor(trace.id)}
            className={cn(AGENT_BUBBLE, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}
          >
            {text}
          </button>
        )}
        {expanded && (
          <AnnotationBar
            // 16px off the reply; the turn's 8px rhythm collapses into this margin
            className="mt-4"
            note={noteFor(trace)}
            onNoteChange={(value) => setNotes((prev) => ({ ...prev, [trace.id]: value }))}
            onSubmitNote={() => saveNoteIfChanged(trace)}
            disabled={readOnly}
            disabledReason="Read-only demo"
            actions={
              <TagPicker
                value={tags}
                onChange={(next) => setVisibleTags(trace, next)}
                disabled={readOnly}
                label={tags.length > 0 ? `Tags · ${tags.length}` : "+ Tag"}
              />
            }
          />
        )}
      </div>
    );
  }

  return { cursor, setCursor, renderTurn, taggedCount };
}
