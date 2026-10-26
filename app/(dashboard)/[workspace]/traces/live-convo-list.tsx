"use client";

import { Bot, Clock, Coins, Cpu, Timer, type LucideIcon } from "lucide-react";
import { useConvoTriage } from "@/components/traces/convo-triage";
import type { AnnotationPatch } from "@/components/traces/trace-sheet";
import type { TraceWithLatestAnnotation } from "@/lib/db/types";
import { useSelection } from "@/lib/context/selection";
import { cn, formatCost, relativeTime } from "@/lib/utils";

function timeOfDay(date: string): string {
  return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function RailItem({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="flex w-4 shrink-0 justify-center">
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/**
 * Live traces as conversations. Each row keeps its details in a left rail
 * (select, date, time, model, cost) with the exchange beside it at reading width.
 */
export function LiveConvoList({
  traces,
  showAgent,
  readOnly,
  paused,
  onTagsSaved,
  onOpenDetails,
}: {
  traces: TraceWithLatestAnnotation[];
  /** The "all" workspace mixes agents, so each row names its own. */
  showAgent: boolean;
  readOnly: boolean;
  /** True while the trace sheet is open, so its keys win. */
  paused: boolean;
  onTagsSaved: (traceId: string, patch: AnnotationPatch) => void;
  onOpenDetails: (trace: TraceWithLatestAnnotation) => void;
}) {
  const { toggleTrace, isTraceSelected, isLastSelected } = useSelection();
  const { cursor, setCursor, renderTurn, taggedCount } = useConvoTriage({
    order: traces,
    readOnly,
    paused,
    onTagsSaved,
    onOpenDetails,
  });

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-md border">
        {traces.map((trace) => {
          const expanded = cursor === trace.id;
          return (
            <div key={trace.id} className="grid grid-cols-[13rem_minmax(0,1fr)] gap-4 p-1.5 max-sm:grid-cols-1 max-sm:gap-0">
              {/* pt-3 matches the turn's padding so the rail's first line sits level with the first bubble */}
              <div className="flex items-start gap-4 px-2 pt-3 text-xs text-muted-foreground max-sm:pb-0">
                <input
                  type="checkbox"
                  aria-label="Select trace"
                  checked={isTraceSelected(trace.id)}
                  onChange={() => toggleTrace(trace.id)}
                  className={cn("shrink-0", isLastSelected(trace.id) && "ring-1 ring-foreground ring-offset-1 ring-offset-background")}
                />
                <dl className="min-w-0 flex-1 space-y-1.5">
                  <RailItem icon={Clock} label="Time">
                    <span className="tabular-nums" suppressHydrationWarning>
                      <span className="text-foreground">{relativeTime(trace.created_at)}</span> · {timeOfDay(trace.created_at)}
                    </span>
                  </RailItem>
                  {showAgent && (
                    <RailItem icon={Bot} label="Agent">
                      {trace.agent}
                    </RailItem>
                  )}
                  <RailItem icon={Cpu} label="Model">
                    <span className="block truncate font-mono text-[11px]" title={trace.model ?? undefined}>
                      {trace.model ?? "—"}
                    </span>
                  </RailItem>
                  {trace.latency_ms != null && (
                    <RailItem icon={Timer} label="Latency">
                      <span className="tabular-nums">{(trace.latency_ms / 1000).toFixed(1)}s</span>
                    </RailItem>
                  )}
                  {trace.cost_usd != null && (
                    <RailItem icon={Coins} label="Cost">
                      <span className="tabular-nums">{formatCost(trace.cost_usd)}</span>
                    </RailItem>
                  )}
                </dl>
              </div>
              <div className="w-full min-w-0 max-w-3xl justify-self-end">
                {renderTurn(trace, expanded, () => setCursor(expanded ? null : trace.id))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 px-1 font-mono text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {taggedCount} tagged · {traces.length - taggedCount} left
        </span>
        <span className="ml-auto">click a reply · ← → move · esc close</span>
      </div>
    </div>
  );
}
