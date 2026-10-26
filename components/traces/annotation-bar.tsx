"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type AnnotationBarProps = {
  note: string;
  onNoteChange: (note: string) => void;
  /** Cmd/Ctrl+Enter or leaving the note: save it. */
  onSubmitNote: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** A row above the note, e.g. a tag picker. */
  actions?: ReactNode;
  className?: string;
};

/** Tags and a note for one trace. */
export const AnnotationBar = forwardRef<HTMLTextAreaElement, AnnotationBarProps>(function AnnotationBar(
  { note, onNoteChange, onSubmitNote, disabled, disabledReason, actions, className },
  forwardedRef
) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [lines, setLines] = useState(1);
  useImperativeHandle(forwardedRef, () => noteRef.current as HTMLTextAreaElement);

  // The box stays the height you drag it to; count how many lines fit so the "…" lands on the last one
  useEffect(() => {
    const frame = frameRef.current;
    const textarea = noteRef.current;
    if (!frame || !textarea) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(textarea);
      const lineHeight = parseFloat(style.lineHeight) || 20;
      const inner = textarea.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setLines(Math.max(1, Math.floor(inner / lineHeight + 0.01)));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const clamped = !focused && note.length > 0;

  return (
    <div className={cn("space-y-2", className)} title={disabled ? disabledReason : undefined}>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      {/* Drag the bottom-right corner to make the box taller. Textareas can't ellipsize, so a clamped copy shows while it's not being edited. */}
      <div
        ref={frameRef}
        className="relative h-9 min-h-9 resize-y overflow-hidden rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 has-disabled:cursor-not-allowed has-disabled:opacity-50 dark:bg-input/30"
      >
        <textarea
          ref={noteRef}
          rows={1}
          value={note}
          disabled={disabled}
          aria-label="Notes"
          onChange={(e) => onNoteChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (noteRef.current) noteRef.current.scrollTop = 0;
            onSubmitNote();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              // Leave the note instead of closing the sheet
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              e.currentTarget.blur();
            }
          }}
          placeholder="Add notes here"
          className={cn(
            "block size-full resize-none bg-transparent px-2.5 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
            clamped ? "overflow-hidden text-transparent" : "overflow-y-auto"
          )}
        />
        {clamped && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 px-2.5 py-2 text-sm leading-snug break-words whitespace-pre-wrap"
            style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
});
