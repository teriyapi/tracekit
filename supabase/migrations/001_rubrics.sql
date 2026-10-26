-- Taste evals: versioned rubrics distilled from verdicts.
-- Run by hand in the Supabase SQL editor.
create table if not exists rubrics (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  version int not null,
  -- [{ id, text, polarity: "do" | "avoid", evidence: [trace ids] }]
  criteria jsonb not null,
  train_trace_ids uuid[] not null,
  created_at timestamptz default now(),
  unique (agent, version)
);
