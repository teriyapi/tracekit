"use client";

import { createContext, useContext } from "react";

/** True for the demo session. The proxy enforces it; this only keeps controls from looking usable. */
const ReadOnlyContext = createContext(false);

export const ReadOnlyProvider = ReadOnlyContext.Provider;

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
