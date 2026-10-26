# Trace Kit

Trace Kit is a trace viewer and eval workbench for my own agents. Agents send each LLM call to it. I read the conversations, tag the replies, and run experiments that replay a dataset through an agent.

**Taste Evals** turns those tags into a judge. I tag replies hit, miss or cringe. Claude drafts a rubric of concrete do/avoid criteria from my verdicts, and an LLM judge scores conversations it never saw. The scoreboard shows how often the judge agrees with me.

## The loop

1. **Tag.** Open a trace on Live Traces and press `1` hit, `2` miss or `3` cringe. Add a one-line note if you want. Saving moves to the next trace. `Shift+1/2/3` tags without advancing.
2. **Draft.** On the Taste tab, click **Draft from my verdicts**. Claude reads the training split and proposes 5–9 criteria. Each criterion cites the conversations it came from; hover one to see them.
3. **Edit and save.** Reword, flip do/avoid, delete or add criteria, then **Save as vN**.
4. **Judge.** Click **Run judge on holdout**. Each holdout conversation is scored separately, 4 at a time. The judge sees only the conversation, never my verdict or note.
5. **Compare and revise.** Read the agreement %, the confusion grid and the disagreements. Click a cited criterion to jump to it, refine the rubric, save v(N+1) and judge again. The delta vs the previous version is computed on the conversations both versions scored.

About 30% of tagged conversations are held out. The split is a stable hash of the user's question text, not the trace id, so a repeated experiment question always lands on the same side. Refining v2 from holdout disagreements does leak holdout signal into the rubric. Treat later versions' scores as optimistic, and tag fresh traces for a clean read.

Verdicts are ordinary tags on `annotations` (`hit`, `miss`, `cringe`). The 1–5 rating is kept as it was.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts` instead of middleware), React 19
- Supabase Postgres, accessed server-side with the service-role key
- Tailwind 4, shadcn on Base UI
- `@anthropic-ai/sdk` with structured outputs (`claude-sonnet-4-5`; the judge runs at temperature 0)
- `packages/sdk`: `@teriyapi/tracekit-sdk`, the client agents use to send traces and run experiments

## Run locally

```bash
pnpm install
cp .env.example .env.local   # or create it; names below
pnpm dev                     # http://localhost:3005
```

Run the SQL in `supabase/migrations/` in the Supabase SQL editor before using the Taste tab. Drafting works without it; saving rubrics and judging don't.

## Environment

| Name | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access |
| `DASHBOARD_PASSWORD` | Owner login. Also signs session cookies, so changing it signs everyone out |
| `DEMO_PASSWORD` | Optional read-only demo login |
| `TRACEKIT_INGEST_TOKEN` | `x-tracekit-token` header agents send to `/api/ingest` |
| `ANTHROPIC_API_KEY` | Rubric drafting and the judge |
| `NEXT_PUBLIC_SITE_URL` | Optional. Public URL shown in the onboarding snippet |

## Demo login

Signing in with `DEMO_PASSWORD` gives a read-only session. The proxy returns 403 for every non-GET `/api/*` request from it, and for `/api/export`. The one exception is `/api/judge/score`, capped at 40 calls an hour per server instance. Runner tokens are never sent to the browser; the owner sees the last 4 characters.

Live traces can contain real people's messages. Think about who gets the demo password.

## Schema

The base schema lives in the Supabase project and is not in this repo yet. Types are in `lib/db/types.ts`.

| Table / view | Notes |
|---|---|
| `traces` | One row per LLM call: `agent`, `source` (`live` or `experiment`), `experiment_id`, `input` jsonb, `output`, `model`, `latency_ms`, `cost_usd`, `metadata` |
| `annotations` | Append-only. Each save inserts a row with `rating`, `reason`, `tags`. The latest row wins |
| `tags` | Tag names and descriptions |
| `experiments` | `status` goes `pending` → `running` (first trace arrives) → `completed` or `failed`. Shown as stalled after 10 minutes with no traces |
| `agent_runners` | Runner URL and token per agent |
| `traces_with_latest_annotation` (view) | `traces.*` plus `latest_rating`, `latest_reason`, `latest_tags`, `latest_annotation_at` |
| `experiments_with_stats` (view) | `experiments.*` plus `computed_avg_rating` |
| `rubrics` | `supabase/migrations/001_rubrics.sql`. Versioned criteria per agent, plus the training trace ids each was drafted from |
| `judge_scores` | `supabase/migrations/002_judge.sql`. One verdict, rationale and cited criteria per rubric and trace |

## Sending traces

See `docs/runner-reference.md` for the SDK and the experiment runner contract.
