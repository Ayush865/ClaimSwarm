#!/usr/bin/env tsx
/**
 * Run this ONCE to create DB tables + enable Realtime:
 *   npx tsx scripts/apply-migration.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// Each statement must be run separately via the REST API
// Since exec_sql isn't available, we POST each DDL through pg.
// The easiest path is to use the Supabase CLI or paste migration SQL in the dashboard.

const MIGRATION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              ClaimSwarm — Supabase Setup Instructions            ║
╚══════════════════════════════════════════════════════════════════╝

The fastest way to set up your database:

1. Open Supabase SQL Editor:
   https://supabase.com/dashboard/project/namokrmkkykcpcjiunpl/sql/new

2. Paste the contents of: supabase/migrations/001_initial.sql
   (all ~80 lines)

3. Click "Run"

4. Enable Storage bucket:
   - Go to: Storage > New bucket
   - Name: resumes
   - Public: OFF

5. That's it! Your swarm DB is ready.

If you have psql and the connection string, you can also run:
   psql "<connection-string>" -f supabase/migrations/001_initial.sql
`);
