"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type SelectionContextValue = {
  selectedTraceIds: Set<string>;
  selectedExperimentIds: Set<string>;
  lastSelectedId: string | null;
  totalCount: number;
  toggleTrace: (id: string) => void;
  toggleExperiment: (id: string, traceIds?: string[]) => void;
  isTraceSelected: (id: string) => boolean;
  isExperimentSelected: (id: string) => boolean;
  isLastSelected: (id: string) => boolean;
  clearAll: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedTraceIds, setSelectedTraceIds] = useState<Set<string>>(new Set());
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const toggleTrace = useCallback((id: string) => {
    setSelectedTraceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setLastSelectedId(null);
      } else {
        next.add(id);
        setLastSelectedId(id);
      }
      return next;
    });
  }, []);

  const toggleExperiment = useCallback((id: string, traceIds?: string[]) => {
    setSelectedExperimentIds((prev) => {
      const next = new Set(prev);
      const selecting = !next.has(id);
      if (selecting) {
        next.add(id);
        setLastSelectedId(id);
      } else {
        next.delete(id);
        setLastSelectedId(null);
      }

      // Also add/remove all traces belonging to this experiment
      if (traceIds && traceIds.length > 0) {
        setSelectedTraceIds((prevTraces) => {
          const nextTraces = new Set(prevTraces);
          for (const tid of traceIds) {
            if (selecting) nextTraces.add(tid);
            else nextTraces.delete(tid);
          }
          return nextTraces;
        });
      }

      return next;
    });
  }, []);

  const isTraceSelected = useCallback((id: string) => selectedTraceIds.has(id), [selectedTraceIds]);
  const isExperimentSelected = useCallback((id: string) => selectedExperimentIds.has(id), [selectedExperimentIds]);
  const isLastSelected = useCallback((id: string) => lastSelectedId === id, [lastSelectedId]);

  const clearAll = useCallback(() => {
    setSelectedTraceIds(new Set());
    setSelectedExperimentIds(new Set());
    setLastSelectedId(null);
  }, []);

  const totalCount = selectedTraceIds.size;

  return (
    <SelectionContext value={{
      selectedTraceIds,
      selectedExperimentIds,
      lastSelectedId,
      totalCount,
      toggleTrace,
      toggleExperiment,
      isTraceSelected,
      isExperimentSelected,
      isLastSelected,
      clearAll,
    }}>
      {children}
    </SelectionContext>
  );
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}
