import type { AgentRunner, PublicAgentRunner } from "@/lib/db/types";
import type { Role } from "@/lib/auth/session";

/** Strips runner_token before a runner row leaves the server. */
export function toPublicRunner({ runner_token, ...runner }: AgentRunner, role: Role | null): PublicAgentRunner {
  return {
    ...runner,
    has_token: !!runner_token,
    runner_token_hint: role === "owner" && runner_token ? runner_token.slice(-4) : null,
  };
}
