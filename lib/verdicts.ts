// Verdicts are stored as reserved tags on annotations, so no schema change is needed.
export const VERDICTS = ["hit", "miss", "cringe"] as const;

export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

export function getVerdict(tags: string[] | null | undefined): Verdict | null {
  return (tags || []).find(isVerdict) ?? null;
}

/** Replace any existing verdict tag with `verdict`, keeping every other tag in order. */
export function withVerdict(tags: string[] | null | undefined, verdict: Verdict): string[] {
  return [...(tags || []).filter((t) => !isVerdict(t)), verdict];
}

export const VERDICT_KEYS: Record<string, Verdict> = { "1": "hit", "2": "miss", "3": "cringe" };

/** Drop any verdict tag, keeping every other tag in order. */
export function withoutVerdict(tags: string[] | null | undefined): string[] {
  return (tags || []).filter((t) => !isVerdict(t));
}
