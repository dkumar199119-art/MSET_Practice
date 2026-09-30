/**
 * Applies SQL migrations in db/migrations in lexical order.
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --reset drop and recreate the schema (development only)
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

export async function migrate(connectionString: string, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const client = new Client({ connectionString });
  await client.connect();
  const log = (m: string) => !opts.quiet && console.log(m);
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");
      await client.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
      log("Schema reset.");
    }
    await client.query(
      "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await client.query("alter table public.schema_migrations enable row level security");
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ name: string }>("select name from public.schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(path.join(dir, f), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [f]);
        await client.query("commit");
        log(`Applied ${f}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  migrate(url, { reset: process.argv.includes("--reset") }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
