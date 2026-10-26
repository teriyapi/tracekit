-- Taste evals: one judge verdict per (rubric version, trace).
-- Run by hand in the Supabase SQL editor, after 001_rubrics.sql.
create table if not exists judge_scores (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid references rubrics(id) on delete cascade,
  trace_id uuid references traces(id) on delete cascade,
  verdict text check (verdict in ('hit', 'miss', 'cringe')),
  rationale text,
  criteria_ids text[],
  created_at timestamptz default now(),
  unique (rubric_id, trace_id)
);
