import { extractExchange } from "@/lib/conversation";
import type { Trace } from "@/lib/db/types";

/** FNV-1a: small, stable, and identical on server and client. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ~30% of keys land in the holdout set (measures agreement); the rest train the rubric. */
export function isHoldout(key: string): boolean {
  return hash(key) % 10 < 3;
}

/**
 * The key a trace is split on. Experiments re-run the same questions, so splitting
 * on trace id would put the same question in both train and holdout. Split on the
 * question instead; traces without one fall back to their id.
 */
export function splitKey(trace: Pick<Trace, "id" | "input" | "output">): string {
  const { userTurns } = extractExchange(trace);
  const question = userTurns.join("\n").trim().toLowerCase();
  return question || trace.id;
}

export function isHoldoutTrace(trace: Pick<Trace, "id" | "input" | "output">): boolean {
  return isHoldout(splitKey(trace));
}
