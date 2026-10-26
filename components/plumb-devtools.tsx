"use client";

import { Plumb } from "plumbkit/react";

/** Alignment-guide overlay for dev. The root layout only renders this outside production. */
export function PlumbDevtools() {
  return <Plumb />;
}
