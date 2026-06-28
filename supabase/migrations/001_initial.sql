-- ClaimSwarm initial schema
-- Run this in your Supabase SQL editor

-- jobs: one verification batch
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text,
  source text not null default 'upload',
  status text not null default 'created',
  total_candidates int default 0,
  total_claims int default 0,
  claims_done int default 0,
  cost_usd numeric default 0,
  tokens_used bigint default 0,
  created_at timestamptz default now()
);

-- candidates: one resume per candidate
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  name text,
  github_handle text,
  storage_path text,
  raw_text text,
  trust_score int,
  trust_summary text,
  status text default 'pending',
  github_evidence jsonb,
  created_at timestamptz default now()
);

-- claims: unit of work for the swarm
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  text text not null,
  claim_type text,
  importance text default 'medium',
  status text default 'pending',
  verdict text,
  confidence numeric,
  reasoning text,
  evidence jsonb,
  model text,
  tokens int,
  expected_verdict text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- metrics: per-run throughput samples
create table if not exists metrics (
  id bigint generated always as identity primary key,
  job_id uuid references jobs(id) on delete cascade,
  t timestamptz default now(),
  claims_done int,
  cost_usd numeric,
  active_agents int
);

-- Trigger to keep updated_at current
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists claims_updated_at on claims;
create trigger claims_updated_at
  before update on claims
  for each row execute function update_updated_at();

-- Enable Realtime for live swarm grid
alter publication supabase_realtime add table claims;
alter publication supabase_realtime add table jobs;

-- Grant full access to all Supabase roles (required for service_role to work)
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all functions in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;

-- Storage bucket for resumes (run separately or via Supabase dashboard)
-- insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
-- on conflict do nothing;
