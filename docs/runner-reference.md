# Runner Reference Implementation

This file documents how to set up a runner endpoint in your agent's repo so tracekit can trigger experiment runs remotely.

## Architecture

1. You configure a `runner_url` and `runner_token` in tracekit's Settings page
2. When a user clicks "Start experiment" in tracekit, it POSTs to your runner URL with the dataset
3. Your runner calls the tracekit SDK's `runExperiment()` which writes traces back to tracekit
4. tracekit polls for status updates and shows results in real-time

## Example Runner (Next.js API Route)

```ts
// In your agent's repo: app/api/tracekit-runner/route.ts

import { NextResponse } from "next/server";
import { runExperiment } from "tracekit-sdk"; // or relative import from tracekit repo
import { yourAgent } from "@/lib/your-agent"; // your actual agent

export async function POST(request: Request) {
  // Verify the request is from tracekit
  const auth = request.headers.get("authorization");
  const expectedToken = process.env.TRACEKIT_RUNNER_TOKEN;
  if (!auth?.startsWith("Bearer ") || auth.slice(7) !== expectedToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { experiment_id, name, dataset, callback_token } = await request.json();

  // Run in background — return 202 immediately so tracekit's POST doesn't time out
  (async () => {
    try {
      // Set the env var for the SDK to use when calling back to tracekit
      process.env.TRACEKIT_INGEST_TOKEN = callback_token;

      await runExperiment({
        name,
        agent: "your-agent-name",
        dataset,
        existing_experiment_id: experiment_id, // tracekit already created the row
        run: async (item) => {
          const output = await yourAgent.respond(item.user_message || item.input);
          return { output, model: "claude-haiku-4-5-20251001" };
        },
      });
    } catch (err) {
      console.error("Experiment failed:", err);
      // The SDK will mark the experiment as failed via the complete endpoint
    }
  })();

  return NextResponse.json({ accepted: true }, { status: 202 });
}
```

## Environment Variables (in your agent's repo)

```env
TRACEKIT_RUNNER_TOKEN=<the token you set in tracekit's Settings page>
TRACEKIT_API_URL=http://localhost:3000  # or your deployed tracekit URL
```

Note: `TRACEKIT_INGEST_TOKEN` is passed dynamically via `callback_token` in the request body, so the runner doesn't need it pre-configured.

## Request Shape (what tracekit sends to your runner)

```json
{
  "experiment_id": "uuid",
  "name": "experiment-2026-05-03-1430",
  "dataset": [{"user_message": "hello"}, {"user_message": "world"}],
  "callback_token": "<TRACEKIT_INGEST_TOKEN>"
}
```

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <runner_token>`

## Expected Response

Return `202 Accepted` immediately. The actual experiment execution happens asynchronously.

```json
{ "accepted": true }
```

If validation fails, return 4xx with an error body. tracekit will mark the experiment as failed.
