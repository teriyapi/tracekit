"use client";

import { useCallback, useSyncExternalStore } from "react";

export type View = "convo" | "table";

// Remembered per browser; a tiny store so useSyncExternalStore can read it without a hydration mismatch
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Convo or table, remembered under `key`. The server render always gets `fallback`. */
export function useStoredView(key: string, fallback: View = "convo"): [View, (view: View) => void] {
  const read = useCallback((): View => {
    try {
      const stored = localStorage.getItem(key);
      return stored === "convo" || stored === "table" ? stored : fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);

  const view = useSyncExternalStore(subscribe, read, () => fallback);

  const write = useCallback(
    (next: View) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage blocked: the toggle still works for this page view
      }
      listeners.forEach((l) => l());
    },
    [key]
  );

  return [view, write];
}
