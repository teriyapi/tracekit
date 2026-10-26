import type { Trace } from "@/lib/db/types";

export type Exchange = {
  /** The last (up to) two user messages, oldest first. */
  userTurns: string[];
  reply: string;
};

type Message = { role?: unknown; content?: unknown };

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string"
          ? (block as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

/**
 * Pull the user's side of the conversation and the agent's reply out of a trace.
 * teri traces come in three input shapes:
 *   live:             { user_message, messages: [{ role, content }] }
 *   runner (current): { user_message, item }
 *   runner (older):   { item: { input } }
 */
/**
 * teri appends UI protocol blocks after the reply (e.g. "---followups---" with
 * suggested questions, "---askwho---"). They aren't her voice, so drop them.
 */
export function stripProtocolBlocks(output: string): string {
  return output.split(/\n?---[a-z_]+---/)[0].trim();
}

export function extractExchange(trace: Pick<Trace, "input" | "output">): Exchange {
  const input = (trace.input || {}) as Record<string, unknown>;
  const reply = stripProtocolBlocks(trace.output || "");

  if (Array.isArray(input.messages)) {
    const userTurns = (input.messages as Message[])
      .filter((m) => m && m.role === "user")
      .map((m) => contentToText(m.content))
      .filter((t) => t.trim().length > 0)
      .slice(-2);
    if (userTurns.length > 0) return { userTurns, reply };
  }

  if (typeof input.user_message === "string") {
    return { userTurns: [input.user_message], reply };
  }

  const item = input.item as Record<string, unknown> | undefined;
  if (item && typeof item === "object") {
    const text = typeof item.user_message === "string" ? item.user_message : item.input;
    if (typeof text === "string") return { userTurns: [text], reply };
  }

  return { userTurns: [], reply };
}

/** True when the trace has a readable conversation (vs. an arbitrary JSON input). */
export function hasExchange(trace: Pick<Trace, "input" | "output">): boolean {
  return extractExchange(trace).userTurns.length > 0;
}
