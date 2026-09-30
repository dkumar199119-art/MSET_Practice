import { Client } from "pg";
import { migrate } from "../../scripts/migrate";
import { seed } from "../../scripts/seed";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://obe_owner:obe_owner@localhost:5432/obe_test";

export async function resetTestDb(students = 60) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
  await migrate(TEST_DB, { reset: true, quiet: true });
  await seed(TEST_DB, { quiet: true, students });
}

export async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: TEST_DB });
  await c.connect();
  try {
    return (await c.query(q, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Execute raw SQL *as a given user under RLS* (bypassing the service layer). */
export async function sqlAs<T = Record<string, unknown>>(userId: string, q: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: TEST_DB });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("set local role obe_app");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
    const r = await c.query(q, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

export async function userId(email: string) {
  return (await sql<{ id: string }>("select id from users where email = $1", [email]))[0].id;
}
