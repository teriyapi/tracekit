import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side Anthropic client. Reads ANTHROPIC_API_KEY.
 * NEVER import this from a client component.
 */
export const JUDGE_MODEL = "claude-sonnet-4-5";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
