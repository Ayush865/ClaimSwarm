import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Use the Supabase REST SQL endpoint (postgres/v1/query requires pg direct access)
  // Instead: use the pg connection string via supabase-js rpc fallback — or just use
  // the management API. Simplest: hit the SQL endpoint via pg REST proxy.
  const res = await fetch(`${url}/rest/v1/`, {
    method: "HEAD",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("Supabase reachable:", res.ok);

  // Use the direct postgres connection via pgrest
  const sql = `
    alter table candidates add column if not exists employers text[] default '{}';
    alter table claims add column if not exists company text;
  `;

  const sqlRes = await fetch(`${url.replace("supabase.co", "supabase.co")}/rest/v1/rpc/run_sql`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  if (!sqlRes.ok) {
    console.log("RPC not available, trying pg direct...");
    // Fall back: apply via supabase-js createClient (won't work for DDL)
    // The user needs to run the SQL manually in the Supabase dashboard
    console.log("\nPlease run this SQL in the Supabase SQL editor:");
    console.log(sql);
    return;
  }

  console.log("Migration applied:", await sqlRes.json());
}
main().catch(console.error);
