// Chat bubbles keep generous, fixed corners; the rest of the UI uses the 4px radius tokens.
// Chat bubble styles shared by the trace sheet and the experiments convo view.
// The user's side is mono on the right; the agent's reply is a filled bubble on the left.
export const USER_BUBBLE =
  "max-w-[80%] whitespace-pre-wrap break-words rounded-[14px] bg-muted px-3 py-2 font-mono text-xs text-muted-foreground";
export const AGENT_BUBBLE =
  "block w-fit max-w-[92%] whitespace-pre-wrap break-words rounded-[14px] bg-foreground/[0.06] px-3.5 py-2.5 text-left text-sm leading-relaxed";
