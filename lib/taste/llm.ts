import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, JUDGE_MODEL } from "@/lib/llm/client";
import type { Criterion } from "@/lib/db/types";
import type { Exchange } from "@/lib/conversation";
import type { TasteExample } from "@/lib/taste/examples";
import { VERDICTS, type Verdict } from "@/lib/verdicts";

const DraftSchema = z.object({
  criteria: z.array(
    z.object({
      text: z.string(),
      polarity: z.enum(["do", "avoid"]),
      evidence: z.array(z.string()),
    })
  ),
});

const JudgeSchema = z.object({
  verdict: z.enum(VERDICTS),
  rationale: z.string(),
  criteria_ids: z.array(z.string()),
});

const DRAFT_SYSTEM = `This agent speaks as a specific person, in first person, as if it were them. You are distilling that person's taste for how they sound, using only their own verdicts on real replies the agent gave.

Verdicts:
- hit: sounds like them
- miss: doesn't sound like them, or misses what they'd say
- cringe: embarrassing; they would never say it

Write 5 to 9 criteria a stranger could apply to a new reply and get the same verdict this person would. Be concrete about word choice, tone, length, humor, rhythm, and what they would never say. Quote exact words or phrases when the evidence shows them. No generic quality words like "engaging", "helpful", "clear", or "authentic".

Each criterion has a polarity: "do" (hits have it) or "avoid" (misses and cringes have it). Each criterion cites the trace ids of the examples that support it, using the exact ids given. Only cite ids you were given.

Grade voice and taste only. Factual accuracy about the person's life is out of scope unless their own notes make a recurring point about it.`;

const JUDGE_SYSTEM = `You judge whether a reply from an AI agent sounds like the specific person it speaks as. You apply that person's rubric exactly as written, nothing else.

Verdicts:
- hit: sounds like them; satisfies the "do" criteria that apply and violates no "avoid" criteria
- miss: doesn't sound like them, or misses what they'd say, but isn't embarrassing
- cringe: embarrassing; something they would never say

Judge the reply in the context of what the user asked. Don't judge factual accuracy about the person. Cite the ids of the criteria that decided your verdict. The rationale is one sentence.`;

function formatTurns(userTurns: string[]): string {
  return userTurns.length > 0
    ? userTurns.map((t) => `<user>${t || "(empty message)"}</user>`).join("\n")
    : "<user>(no user message recorded)</user>";
}

function formatExample(e: TasteExample): string {
  return [
    `<example id="${e.trace_id}" verdict="${e.verdict}">`,
    formatTurns(e.userTurns),
    `<reply>${e.reply}</reply>`,
    e.note ? `<their_note>${e.note}</their_note>` : null,
    `</example>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCriteria(criteria: Criterion[]): string {
  return criteria.map((c) => `<criterion id="${c.id}" polarity="${c.polarity}">${c.text}</criterion>`).join("\n");
}

/** Ask Claude for a rubric. With `previous`, revise it instead of starting over. */
export async function draftRubric(
  examples: TasteExample[],
  previous?: Criterion[]
): Promise<Criterion[]> {
  const validIds = new Set(examples.map((e) => e.trace_id));
  const sections = [
    `<examples count="${examples.length}">\n${examples.map(formatExample).join("\n\n")}\n</examples>`,
  ];
  if (previous && previous.length > 0) {
    sections.push(
      `<current_rubric>\n${formatCriteria(previous)}\n</current_rubric>\n\nRevise the current rubric rather than starting over: keep criteria the examples still support, sharpen vague ones, drop ones the examples contradict, and add what's missing. Re-cite evidence from these examples.`
    );
  } else {
    sections.push("Write the rubric.");
  }

  const response = await getAnthropic().messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 8000,
    system: DRAFT_SYSTEM,
    messages: [{ role: "user", content: sections.join("\n\n") }],
    output_config: { format: zodOutputFormat(DraftSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Draft returned no rubric (stop_reason: ${response.stop_reason})`);

  return parsed.criteria.map((c, i) => ({
    id: `c${i + 1}`,
    text: c.text.trim(),
    polarity: c.polarity,
    evidence: [...new Set(c.evidence)].filter((id) => validIds.has(id)),
  }));
}

export type JudgeResult = { verdict: Verdict; rationale: string; criteria_ids: string[] };

/** Score one exchange against a rubric. The judge never sees my verdict or note. */
export async function judgeExchange(criteria: Criterion[], exchange: Exchange): Promise<JudgeResult> {
  const validIds = new Set(criteria.map((c) => c.id));
  const response = await getAnthropic().messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 1024,
    temperature: 0,
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<rubric>\n${formatCriteria(criteria)}\n</rubric>\n\n<conversation>\n${formatTurns(exchange.userTurns)}\n<reply>${exchange.reply}</reply>\n</conversation>\n\nGive your verdict on the reply.`,
      },
    ],
    output_config: { format: zodOutputFormat(JudgeSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Judge returned no verdict (stop_reason: ${response.stop_reason})`);

  return {
    verdict: parsed.verdict,
    rationale: parsed.rationale.trim(),
    criteria_ids: parsed.criteria_ids.filter((id) => validIds.has(id)),
  };
}
