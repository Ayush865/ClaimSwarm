-- Add employers column to store LLM-extracted employer/company names per candidate
alter table candidates add column if not exists employers text[] default '{}';

-- Add company column to claims so each claim knows which employer/org it relates to
alter table claims add column if not exists company text;
