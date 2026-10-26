import type { Experiment } from "@/lib/db/types";

export const STALL_AFTER_MS = 10 * 60 * 1000;

/** Still waiting on the runner with nothing to show for it after 10 minutes. */
export function isStalled(
  experiment: Pick<Experiment, "status" | "trace_count" | "created_at">,
  now = Date.now()
): boolean {
  return (
    (experiment.status === "pending" || experiment.status === "running") &&
    experiment.trace_count === 0 &&
    now - new Date(experiment.created_at).getTime() > STALL_AFTER_MS
  );
}

export const STALLED_TITLE = "No traces after 10 minutes. The runner may never have received it.";
