-- Run this in Supabase SQL Editor to fix service_role permissions
-- Dashboard: https://supabase.com/dashboard/project/namokrmkkykcpcjiunpl/sql/new

-- 1. Grant schema usage
grant usage on schema public to postgres, anon, authenticated, service_role;

-- 2. Grant table access
grant all privileges on all tables in schema public to postgres, anon, authenticated, service_role;

-- 3. Grant sequence access (for auto-increment IDs)
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;

-- 4. Grant function access
grant all privileges on all functions in schema public to postgres, anon, authenticated, service_role;

-- 5. Make these grants apply to future tables too
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;

-- Verify: should return rows without error
select id from jobs limit 1;
