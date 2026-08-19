#!/usr/bin/env node
/**
 * Telt Supabase-tabellen (service_role) en kan daarna naar Neon laden.
 * Doet niets zonder env vars. Default is dry-run.
 *
 *   node scripts/migrate-to-neon.js
 *   node scripts/migrate-to-neon.js --apply
 *
 * Nodig: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEON_DATABASE_URL
 * Schema moet al op Neon staan (neon/schema.sql).
 */

const fs = require("fs");
const path = require("path");

const TABLES = [
  "families",
  "children",
  "profiles",
  "monthly_budgets",
  "transactions",
  "coach_settings",
  "child_budget_snapshots",
];

const apply = process.argv.includes("--apply");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Ontbrekende env: ${name}`);
  }
  return value;
}

async function supabaseSelect(table) {
  const url = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
        Range: `${from}-${to}`,
      },
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`${table}: ${response.status} ${bodyText}`);
    }
    const page = JSON.parse(bodyText);
    rows.push(...page);
    const range = response.headers.get("content-range") || "";
    const total = Number((range.split("/")[1] || "").trim());
    if (!Number.isFinite(total) || rows.length >= total || page.length === 0) {
      return { rows, total: Number.isFinite(total) ? total : rows.length };
    }
    from += pageSize;
  }
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value).replaceAll("'", "''");
    return `'${json}'::jsonb`;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(table, row) {
  const columns = Object.keys(row);
  const cols = columns.map(quoteIdent).join(", ");
  const vals = columns.map((column) => sqlLiteral(row[column])).join(", ");
  const conflictColumn = table === "child_budget_snapshots" ? "child_id" : "id";
  const updates = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
    .join(", ");
  return `insert into public.${table} (${cols}) values (${vals}) on conflict (${conflictColumn}) do update set ${updates}`;
}

async function main() {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEON_DATABASE_URL"].filter(
    (name) => !process.env[name]
  );
  if (missing.length) {
    console.log("Dry check: ontbrekende env vars, er wordt niets geladen.");
    console.log(`Ontbreekt: ${missing.join(", ")}`);
    console.log("Zet waarden in een lokale .env (niet committen) en run opnieuw.");
    process.exit(0);
  }

  const counts = [];
  const dumpDir = path.join(__dirname, "..", "neon", "export");
  fs.mkdirSync(dumpDir, { recursive: true });

  for (const table of TABLES) {
    const { rows, total } = await supabaseSelect(table);
    counts.push({ table, total, fetched: rows.length });
    fs.writeFileSync(path.join(dumpDir, `${table}.json`), JSON.stringify(rows));
    console.log(`${table}: ${total} rijen (fetch ${rows.length})`);
  }

  fs.writeFileSync(path.join(dumpDir, "counts.json"), JSON.stringify(counts, null, 2));

  if (!apply) {
    console.log("Dry-run klaar. Export staat in neon/export/. Run met --apply om naar Neon te schrijven.");
    return;
  }

  const { neon } = require("@neondatabase/serverless");
  const sql = neon(requiredEnv("NEON_DATABASE_URL"));
  for (const table of TABLES) {
    const rows = JSON.parse(fs.readFileSync(path.join(dumpDir, `${table}.json`), "utf8"));
    for (const row of rows) {
      await sql.query(insertStatement(table, row));
    }
    console.log(`Neon load: ${table} (${rows.length})`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
