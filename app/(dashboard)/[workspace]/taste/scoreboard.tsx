"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VerdictDot } from "@/components/traces/verdict-bar";
import type { Criterion, JudgeScore, Rubric } from "@/lib/db/types";
import type { TasteExample } from "@/lib/taste/examples";
import { VERDICTS, type Verdict } from "@/lib/verdicts";
import { cn } from "@/lib/utils";

const CONCURRENCY = 4;

type Pair = { example: TasteExample; score: JudgeScore };

function pairsFor(rubricId: string, holdout: TasteExample[], scores: JudgeScore[]): Pair[] {
  const byTrace = new Map(scores.filter((s) => s.rubric_id === rubricId).map((s) => [s.trace_id, s]));
  return holdout.flatMap((example) => {
    const score = byTrace.get(example.trace_id);
    return score ? [{ example, score }] : [];
  });
}

function agreement(pairs: Pair[]): number | null {
  if (pairs.length === 0) return null;
  return (pairs.filter((p) => p.score.verdict === p.example.verdict).length / pairs.length) * 100;
}

/** Hit vs cringe is a worse miss than hit vs miss. */
const DISTANCE: Record<Verdict, number> = { hit: 0, miss: 1, cringe: 2 };

function useCountUp(target: number | null, durationMs = 700): number | null {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (target == null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return target == null ? null : value;
}

/** Compare against the closest older version that has scores, on the conversations both scored. */
function deltaFor(rubric: Rubric, rubrics: Rubric[], holdout: TasteExample[], scores: JudgeScore[], pairs: Pair[]) {
  for (const prev of rubrics.filter((r) => r.version < rubric.version)) {
    const prevPairs = pairsFor(prev.id, holdout, scores);
    if (prevPairs.length === 0) continue;
    const shared = new Set(prevPairs.map((p) => p.example.trace_id));
    const mine = pairs.filter((p) => shared.has(p.example.trace_id));
    const theirs = prevPairs.filter((p) => mine.some((m) => m.example.trace_id === p.example.trace_id));
    const a = agreement(mine);
    const b = agreement(theirs);
    if (a == null || b == null) continue;
    return { version: prev.version, points: Math.round(a - b), shared: mine.length };
  }
  return null;
}

export function Scoreboard({
  rubric,
  rubrics,
  holdout,
  scores,
  criteria,
  onScored,
  onOpenTrace,
  onCriterionClick,
  readOnly = false,
  judgeDisabled = false,
}: {
  /** The saved version being scored; null while an unsaved draft is open. */
  rubric: Rubric | null;
  rubrics: Rubric[];
  holdout: TasteExample[];
  scores: JudgeScore[];
  criteria: Criterion[];
  onScored: (score: JudgeScore) => void;
  onOpenTrace: (traceId: string) => void;
  onCriterionClick: (criterionId: string) => void;
  readOnly?: boolean;
  judgeDisabled?: boolean;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number; errors: number } | null>(null);
  const cancelRef = useRef(false);

  const pairs = useMemo(() => (rubric ? pairsFor(rubric.id, holdout, scores) : []), [rubric, holdout, scores]);
  const pct = agreement(pairs);
  const shown = useCountUp(pct == null ? null : Math.round(pct));
  const agreeCount = pairs.filter((p) => p.score.verdict === p.example.verdict).length;
  const unscored = rubric ? holdout.filter((e) => !pairs.some((p) => p.example.trace_id === e.trace_id)) : [];

  const delta = rubric ? deltaFor(rubric, rubrics, holdout, scores, pairs) : null;

  const confusion = useMemo(() => {
    const grid: Record<Verdict, Record<Verdict, number>> = {
      hit: { hit: 0, miss: 0, cringe: 0 },
      miss: { hit: 0, miss: 0, cringe: 0 },
      cringe: { hit: 0, miss: 0, cringe: 0 },
    };
    for (const p of pairs) grid[p.example.verdict][p.score.verdict]++;
    return grid;
  }, [pairs]);
  const maxCell = Math.max(1, ...VERDICTS.flatMap((me) => VERDICTS.map((j) => confusion[me][j])));

  const disagreements = pairs
    .filter((p) => p.score.verdict !== p.example.verdict)
    .sort(
      (a, b) =>
        Math.abs(DISTANCE[b.example.verdict] - DISTANCE[b.score.verdict]) -
        Math.abs(DISTANCE[a.example.verdict] - DISTANCE[a.score.verdict])
    );

  const criterionText = new Map(criteria.map((c) => [c.id, c]));

  async function runJudge() {
    if (!rubric || unscored.length === 0) return;
    cancelRef.current = false;
    const queue = [...unscored];
    let done = 0;
    let errors = 0;
    let lastError = "";
    setProgress({ done, total: queue.length, errors });

    async function worker() {
      while (queue.length > 0 && !cancelRef.current) {
        const example = queue.shift()!;
        try {
          const res = await fetch("/api/judge/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rubric_id: rubric!.id, trace_id: example.trace_id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `Judge failed (${res.status})`);
          onScored(data as JudgeScore);
        } catch (err) {
          errors++;
          lastError = (err as Error).message;
        }
        done++;
        setProgress({ done, total: unscored.length, errors });
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setProgress(null);
    if (errors > 0) toast.error(`${errors} judge call${errors === 1 ? "" : "s"} failed: ${lastError}`);
  }

  return (
    <section className="space-y-6 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Judge vs me</h2>
          <p className="text-sm text-muted-foreground">
            {rubric ? `v${rubric.version}` : "Save the draft to judge it"} on {holdout.length} holdout conversation
            {holdout.length === 1 ? "" : "s"} the rubric never saw.
          </p>
        </div>
        {progress ? (
          <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground tabular-nums">
            judging {progress.done}/{progress.total}
            {progress.errors > 0 && ` · ${progress.errors} failed`}
            <Button variant="ghost" size="sm" onClick={() => (cancelRef.current = true)}>
              Stop
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={runJudge}
            disabled={!rubric || unscored.length === 0 || judgeDisabled}
            title={judgeDisabled ? "Run the migrations first" : undefined}
          >
            {rubric && unscored.length === 0 && pairs.length > 0
              ? "All holdout scored"
              : `Run judge on holdout${rubric ? ` (${unscored.length})` : ""}`}
          </Button>
        )}
      </div>

      {pairs.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {rubric ? "No scores for this version yet." : "Nothing to score yet."}
          {readOnly && " Running the judge is allowed in the demo."}
        </p>
      ) : (
        <div className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
          <div className="space-y-6">
            <div>
              <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight">
                {shown == null ? "—" : `${Math.round(shown)}%`}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                agreement · {agreeCount}/{pairs.length} conversations
              </p>
              {delta && (
                <p
                  key={`${rubric?.id}-${delta.points}`}
                  className={cn(
                    "criterion-in mt-2 font-mono text-sm tabular-nums",
                    delta.points > 0 ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {delta.points > 0 ? "+" : ""}
                  {delta.points} pts vs v{delta.version}
                  <span className="text-muted-foreground"> · on {delta.shared} shared</span>
                </p>
              )}
            </div>

            {/* Confusion grid: rows = me, cols = judge */}
            <div className="inline-grid grid-cols-[auto_repeat(3,3.5rem)] gap-1 font-mono text-[11px]">
              <span className="pr-2 text-right text-muted-foreground">me ↓ judge →</span>
              {VERDICTS.map((j) => (
                <span key={j} className="text-center text-muted-foreground">{j}</span>
              ))}
              {VERDICTS.map((me) => (
                <div key={me} className="contents">
                  <span className="flex items-center justify-end pr-2">
                    <VerdictDot verdict={me} />
                  </span>
                  {VERDICTS.map((j) => {
                    const n = confusion[me][j];
                    const strength = n === 0 ? 0 : 10 + Math.round((n / maxCell) * 45);
                    return (
                      <span
                        key={j}
                        className={cn(
                          "flex h-12 items-center justify-center rounded-md border tabular-nums",
                          me === j ? "border-foreground/30" : "border-border",
                          n === 0 && "text-muted-foreground/40"
                        )}
                        style={{ background: `color-mix(in oklch, var(--verdict-${me}) ${strength}%, transparent)` }}
                      >
                        {n}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <h4 className="font-mono text-xs text-muted-foreground">
              {disagreements.length} disagreement{disagreements.length === 1 ? "" : "s"}
            </h4>
            {disagreements.length === 0 && (
              <p className="text-sm text-muted-foreground">The judge agrees with every verdict here.</p>
            )}
            {disagreements.map(({ example, score }) => (
              <div
                key={example.trace_id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenTrace(example.trace_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenTrace(example.trace_id);
                }}
                className="cursor-pointer space-y-1.5 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-foreground/20"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                  <span className="text-muted-foreground">me</span>
                  <VerdictDot verdict={example.verdict} />
                  <span className="text-muted-foreground">judge</span>
                  <VerdictDot verdict={score.verdict} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {example.userTurns[example.userTurns.length - 1] || "(no question)"}
                  </span>
                </div>
                <p className="text-sm leading-snug">
                  {example.reply.slice(0, 160)}
                  {example.reply.length > 160 && "…"}
                </p>
                {example.note && <p className="font-mono text-xs text-muted-foreground">me: {example.note}</p>}
                {score.rationale && <p className="text-xs text-muted-foreground">judge: {score.rationale}</p>}
                {score.criteria_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {score.criteria_ids.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCriterionClick(id);
                        }}
                        title={criterionText.get(id)?.text}
                        className="rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
