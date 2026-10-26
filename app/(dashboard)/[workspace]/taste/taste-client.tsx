"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoseLoader } from "@/components/ui/rose-loader";
import { VerdictDot } from "@/components/traces/verdict-bar";
import { TraceSheet, type AnnotationPatch } from "@/components/traces/trace-sheet";
import type { Criterion, JudgeScore, Rubric, TraceWithLatestAnnotation } from "@/lib/db/types";
import type { TasteExample } from "@/lib/taste/examples";
import { getVerdict } from "@/lib/verdicts";
import { cn } from "@/lib/utils";
import { Scoreboard } from "./scoreboard";

const DRAFT = "draft";

type DraftMeta = { trainIds: string[]; revisedFrom: number | null };

export function TasteClient({
  agent,
  initialExamples,
  initialRubrics,
  initialScores,
  missingMigrations,
  readOnly = false,
}: {
  agent: string;
  initialExamples: TasteExample[];
  initialRubrics: Rubric[];
  initialScores: JudgeScore[];
  missingMigrations: string[];
  readOnly?: boolean;
}) {
  const [examples, setExamples] = useState(initialExamples);
  const [rubrics, setRubrics] = useState(initialRubrics); // newest first
  const [scores, setScores] = useState(initialScores);

  const [selectedId, setSelectedId] = useState<string | null>(initialRubrics[0]?.id ?? null);
  const [criteria, setCriteria] = useState<Criterion[]>(initialRubrics[0]?.criteria ?? []);
  const [draftMeta, setDraftMeta] = useState<DraftMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Bumped when a new set of criteria arrives, to replay the stagger
  const [arrival, setArrival] = useState(0);

  const [activeCriterion, setActiveCriterion] = useState<string | null>(null);
  const [flashCriterion, setFlashCriterion] = useState<string | null>(null);

  const [sheetTrace, setSheetTrace] = useState<TraceWithLatestAnnotation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const train = useMemo(() => examples.filter((e) => !e.holdout), [examples]);
  const holdout = useMemo(() => examples.filter((e) => e.holdout), [examples]);
  const selectedRubric = rubrics.find((r) => r.id === selectedId) ?? null;
  const nextVersion = (rubrics[0]?.version ?? 0) + 1;

  // --- Editor -------------------------------------------------------------

  function selectVersion(id: string) {
    if (dirty && !confirm("Discard unsaved rubric edits?")) return;
    const rubric = rubrics.find((r) => r.id === id);
    if (!rubric) return;
    setSelectedId(id);
    setCriteria(rubric.criteria);
    setDraftMeta(null);
    setDirty(false);
    setArrival((n) => n + 1);
  }

  async function handleDraft() {
    if (dirty && !confirm("Replace your unsaved edits with a new draft?")) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/rubrics/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
      setCriteria(data.criteria);
      setDraftMeta({ trainIds: data.train_trace_ids, revisedFrom: data.revised_from_version });
      setSelectedId(DRAFT);
      setDirty(true);
      setArrival((n) => n + 1);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave() {
    const cleaned = criteria.filter((c) => c.text.trim().length > 0);
    if (cleaned.length === 0) {
      toast.error("Add at least one criterion");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          criteria: cleaned,
          train_trace_ids: draftMeta?.trainIds ?? selectedRubric?.train_trace_ids ?? train.map((e) => e.trace_id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const saved = data as Rubric;
      setRubrics((prev) => [saved, ...prev]);
      setSelectedId(saved.id);
      setCriteria(saved.criteria);
      setDraftMeta(null);
      setDirty(false);
      toast.success(`Saved v${saved.version}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function updateCriterion(id: string, patch: Partial<Criterion>) {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  }

  function deleteCriterion(id: string) {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
    setActiveCriterion(null);
    setDirty(true);
  }

  function addCriterion() {
    const max = criteria.reduce((m, c) => Math.max(m, parseInt(c.id.replace(/\D/g, ""), 10) || 0), 0);
    const id = `c${max + 1}`;
    setCriteria((prev) => [...prev, { id, text: "", polarity: "do", evidence: [] }]);
    setDirty(true);
    requestAnimationFrame(() => criterionRefs.current.get(id)?.querySelector("textarea")?.focus());
  }

  // --- Provenance: criterion ↔ evidence cards ------------------------------

  const containerRef = useRef<HTMLDivElement>(null);
  const evidenceScrollRef = useRef<HTMLDivElement>(null);
  const criterionRefs = useRef(new Map<string, HTMLLIElement>());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<string[]>([]);

  const activeEvidence = useMemo(() => {
    const c = criteria.find((x) => x.id === activeCriterion);
    return c ? new Set(c.evidence) : null;
  }, [criteria, activeCriterion]);

  const computePaths = useCallback(() => {
    const container = containerRef.current;
    const viewport = evidenceScrollRef.current;
    const crit = activeCriterion ? criterionRefs.current.get(activeCriterion) : null;
    if (!container || !viewport || !crit || !activeEvidence) {
      setPaths([]);
      return;
    }
    const box = container.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const from = crit.getBoundingClientRect();
    const x1 = from.right - box.left;
    const y1 = from.top + from.height / 2 - box.top;

    const next: string[] = [];
    for (const id of activeEvidence) {
      const card = cardRefs.current.get(id);
      if (!card) continue;
      const r = card.getBoundingClientRect();
      if (r.bottom < view.top || r.top > view.bottom) continue; // scrolled out of the evidence panel
      const x2 = r.left - box.left;
      const y2 = Math.min(Math.max(r.top + r.height / 2, view.top), view.bottom) - box.top;
      const dx = Math.max((x2 - x1) / 2, 24);
      next.push(`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    }
    setPaths(next);
  }, [activeCriterion, activeEvidence]);

  useLayoutEffect(() => {
    computePaths();
  }, [computePaths]);

  useEffect(() => {
    const viewport = evidenceScrollRef.current;
    window.addEventListener("resize", computePaths);
    window.addEventListener("scroll", computePaths, true);
    viewport?.addEventListener("scroll", computePaths);
    return () => {
      window.removeEventListener("resize", computePaths);
      window.removeEventListener("scroll", computePaths, true);
      viewport?.removeEventListener("scroll", computePaths);
    };
  }, [computePaths]);

  // Bring the first piece of evidence into view when none is visible
  useEffect(() => {
    if (!activeEvidence || activeEvidence.size === 0) return;
    const viewport = evidenceScrollRef.current;
    if (!viewport) return;
    const view = viewport.getBoundingClientRect();
    const cards = [...activeEvidence].map((id) => cardRefs.current.get(id)).filter(Boolean) as HTMLDivElement[];
    const anyVisible = cards.some((c) => {
      const r = c.getBoundingClientRect();
      return r.bottom > view.top && r.top < view.bottom;
    });
    if (!anyVisible && cards[0]) {
      viewport.scrollTo({ top: cards[0].offsetTop - 12, behavior: "smooth" });
    }
  }, [activeEvidence]);

  function focusCriterion(id: string) {
    const el = criterionRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveCriterion(id);
    setFlashCriterion(id);
    setTimeout(() => setFlashCriterion((cur) => (cur === id ? null : cur)), 1400);
  }

  // --- Trace sheet ---------------------------------------------------------

  async function openTrace(traceId: string) {
    const res = await fetch(`/api/traces/${traceId}`);
    if (!res.ok) {
      toast.error("Couldn't load that trace");
      return;
    }
    setSheetTrace(await res.json());
    setSheetOpen(true);
  }

  function handleTagsSaved(traceId: string, patch: AnnotationPatch) {
    const verdict = getVerdict(patch.latest_tags);
    setExamples((prev) =>
      prev.map((e) => (e.trace_id === traceId && verdict ? { ...e, verdict, note: patch.latest_reason } : e))
    );
    setSheetTrace((t) => (t && t.id === traceId ? { ...t, ...patch } : t));
  }

  // --- Render --------------------------------------------------------------

  const versionLabel =
    selectedId === DRAFT
      ? draftMeta?.revisedFrom
        ? `draft · revising v${draftMeta.revisedFrom}`
        : "draft · unsaved"
      : selectedRubric
        ? `v${selectedRubric.version}`
        : "no rubric yet";

  return (
    <div className="space-y-8">
      {missingMigrations.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 font-mono text-xs text-muted-foreground">
          Run {missingMigrations.map((m) => `supabase/migrations/${m}`).join(" and ")}{" "}in the Supabase SQL editor, then reload.
          Drafting works without them; saving and judging don&apos;t.
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Taste</h1>
          <p className="text-sm text-muted-foreground">How {agent} should sound, learned from my verdicts.</p>
        </div>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {examples.length} verdicts · {train.length} train · {holdout.length} holdout
        </p>
      </div>

      {examples.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          No verdicts yet. Open{" "}
          <Link href={`/${agent}/traces?verdict=untagged`} className="text-foreground underline underline-offset-4">
            untagged traces
          </Link>{" "}
          and tag them with <kbd className="font-mono">1</kbd> hit, <kbd className="font-mono">2</kbd> miss,{" "}
          <kbd className="font-mono">3</kbd> cringe.
        </div>
      ) : (
        <div ref={containerRef} className="relative grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-12">
          {/* Connectors from the active criterion to its evidence */}
          <svg className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full overflow-visible md:block" aria-hidden>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1} className="text-foreground/25" />
            ))}
          </svg>

          {/* LEFT: rubric */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedId ?? ""}
                onValueChange={(v: string | null) => v && v !== DRAFT && selectVersion(v)}
              >
                <SelectTrigger className="w-44 font-mono text-xs" aria-label="Rubric version">
                  <SelectValue placeholder="no rubric yet">{versionLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectedId === DRAFT && <SelectItem value={DRAFT}>{versionLabel}</SelectItem>}
                  {rubrics.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      v{r.version} · {r.criteria.length} criteria
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDraft}
                disabled={drafting || readOnly || train.length === 0}
                title={readOnly ? "Read-only demo" : undefined}
              >
                {drafting ? (
                  <span className="inline-flex items-center gap-2"><RoseLoader size={14} /> Drafting…</span>
                ) : (
                  <>{rubrics.length > 0 ? "Revise" : "Draft"} from my verdicts <span className="font-mono text-muted-foreground">({train.length})</span></>
                )}
              </Button>

              <Button
                size="sm"
                className="ml-auto"
                onClick={handleSave}
                disabled={!dirty || saving || readOnly}
                title={readOnly ? "Read-only demo" : undefined}
              >
                {saving ? "Saving…" : `Save as v${nextVersion}`}
              </Button>
            </div>

            {criteria.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Draft a rubric from {train.length} training verdict{train.length === 1 ? "" : "s"} to start.
              </p>
            ) : (
              <ol className="space-y-2" onMouseLeave={() => setActiveCriterion(null)}>
                {criteria.map((c, i) => (
                  <li
                    key={`${arrival}-${c.id}`}
                    ref={(el) => {
                      if (el) criterionRefs.current.set(c.id, el);
                      else criterionRefs.current.delete(c.id);
                    }}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveCriterion(c.id)}
                    onFocus={() => setActiveCriterion(c.id)}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className={cn(
                      "criterion-in group rounded-md border border-border px-3 py-2.5 outline-none transition-colors duration-150",
                      activeCriterion === c.id && "border-foreground/30 bg-muted/40",
                      flashCriterion === c.id && "ring-1 ring-foreground/60"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => updateCriterion(c.id, { polarity: c.polarity === "do" ? "avoid" : "do" })}
                        disabled={readOnly}
                        title="Toggle do / avoid"
                        className={cn(
                          "mt-0.5 w-12 shrink-0 rounded border px-1 py-0.5 text-center font-mono text-[10px] uppercase tracking-wide transition-colors disabled:cursor-not-allowed",
                          c.polarity === "do" ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground line-through decoration-muted-foreground/60"
                        )}
                      >
                        {c.polarity}
                      </button>
                      <textarea
                        value={c.text}
                        onChange={(e) => updateCriterion(c.id, { text: e.target.value })}
                        disabled={readOnly}
                        rows={1}
                        placeholder="what they'd say, or never say"
                        className="field-sizing-content min-h-6 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50 disabled:cursor-default"
                      />
                      <button
                        type="button"
                        onClick={() => deleteCriterion(c.id)}
                        disabled={readOnly}
                        aria-label={`Delete ${c.id}`}
                        className="shrink-0 px-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 disabled:hidden"
                      >
                        ×
                      </button>
                    </div>
                    <p className="mt-1 pl-14 font-mono text-[10px] text-muted-foreground">
                      {c.id} · {c.evidence.length} conversation{c.evidence.length === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={addCriterion}
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                + add criterion
              </button>
            )}
          </section>

          {/* RIGHT: evidence */}
          <section className="space-y-3">
            <h2 className="font-mono text-xs text-muted-foreground">
              training conversations{activeEvidence ? ` · ${activeEvidence.size} cited by ${activeCriterion}` : ""}
            </h2>
            <div ref={evidenceScrollRef} className="relative max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {train.map((e) => {
                const lit = activeEvidence?.has(e.trace_id);
                return (
                  <div
                    key={e.trace_id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(e.trace_id, el);
                      else cardRefs.current.delete(e.trace_id);
                    }}
                    onClick={() => openTrace(e.trace_id)}
                    className={cn(
                      "cursor-pointer space-y-1.5 rounded-md border px-3 py-2.5 transition-[opacity,border-color] duration-150",
                      activeEvidence && !lit && "opacity-30",
                      lit ? "border-foreground/40" : "border-border hover:border-foreground/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <VerdictDot verdict={e.verdict} />
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {e.userTurns[e.userTurns.length - 1] || "(no question)"}
                      </span>
                    </div>
                    <p className="text-sm leading-snug">
                      {e.reply.slice(0, 140)}
                      {e.reply.length > 140 && "…"}
                    </p>
                    {e.note && <p className="font-mono text-xs text-muted-foreground">↳ {e.note}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {examples.length > 0 && (
        <Scoreboard
          rubric={selectedId === DRAFT ? null : selectedRubric}
          rubrics={rubrics}
          holdout={holdout}
          scores={scores}
          onScored={(score) =>
            setScores((prev) => [...prev.filter((s) => !(s.rubric_id === score.rubric_id && s.trace_id === score.trace_id)), score])
          }
          onOpenTrace={openTrace}
          onCriterionClick={focusCriterion}
          criteria={selectedRubric?.criteria ?? []}
          readOnly={readOnly}
          judgeDisabled={missingMigrations.length > 0}
        />
      )}

      <TraceSheet
        trace={sheetTrace}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAnnotationSaved={() => {}}
        onTagsSaved={handleTagsSaved}
        readOnly={readOnly}
      />
    </div>
  );
}
