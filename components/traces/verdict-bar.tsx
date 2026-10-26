"use client";

import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/verdicts";

// Verdicts are gone from the triage UI; only the hidden Taste pages still show them

export const VERDICT_STYLES: Record<Verdict, { text: string; hover: string; bg: string; border: string; dot: string; badge: string }> = {
  hit: {
    badge: "border-verdict-hit/30 bg-verdict-hit/10",
    text: "text-verdict-hit",
    hover: "hover:bg-verdict-hit/15 hover:text-verdict-hit",
    bg: "bg-verdict-hit",
    border: "border-verdict-hit",
    dot: "bg-verdict-hit",
  },
  miss: {
    badge: "border-verdict-miss/30 bg-verdict-miss/10",
    text: "text-verdict-miss",
    hover: "hover:bg-verdict-miss/15 hover:text-verdict-miss",
    bg: "bg-verdict-miss",
    border: "border-verdict-miss",
    dot: "bg-verdict-miss",
  },
  cringe: {
    badge: "border-verdict-cringe/30 bg-verdict-cringe/10",
    text: "text-verdict-cringe",
    hover: "hover:bg-verdict-cringe/15 hover:text-verdict-cringe",
    bg: "bg-verdict-cringe",
    border: "border-verdict-cringe",
    dot: "bg-verdict-cringe",
  },
};

export function VerdictDot({ verdict, className }: { verdict: Verdict | null; className?: string }) {
  if (!verdict) return <span className={cn("text-muted-foreground/50 text-xs", className)}>—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs", VERDICT_STYLES[verdict].text, className)}>
      <span className={cn("size-1.5 rounded-full", VERDICT_STYLES[verdict].dot)} aria-hidden />
      {verdict}
    </span>
  );
}
