import { Pool, types, type PoolClient } from "pg";
import { AppError, toAppError } from "./errors";

// numeric / bigint as JS numbers
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const globalRef = globalThis as unknown as { __obePool?: Pool };

export function getPool(): Pool {
  if (!globalRef.__obePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new AppError("DATABASE_URL is not configured", "CONFIG");
    globalRef.__obePool = new Pool({ connectionString, max: 10 });
  }
  return globalRef.__obePool;
}

export async function closePool() {
  if (globalRef.__obePool) {
    await globalRef.__obePool.end();
    globalRef.__obePool = undefined;
  }
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>;
  maybe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  userId: string | null;
}

function wrap(client: PoolClient, userId: string | null): Db {
  return {
    userId,
    async query(sql, params) {
      const r = await client.query(sql, params as unknown[]);
      return r.rows;
    },
    async one(sql, params) {
      const r = await client.query(sql, params as unknown[]);
      if (r.rows.length === 0) throw new AppError("Record not found or not accessible", "NOT_FOUND");
      return r.rows[0];
    },
    async maybe(sql, params) {
      const r = await client.query(sql, params as unknown[]);
      return r.rows[0] ?? null;
    },
  };
}

export interface DbContext {
  userId: string | null;
  /** Role under which the action is performed; recorded in audit logs. */
  role?: string | null;
}

/**
 * Runs fn in a transaction as the RLS-restricted `obe_app` role with the
 * caller's identity. Every application query goes through this.
 */
export async function withUser<T>(ctx: DbContext, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("set local role obe_app");
    await client.query("select set_config('app.user_id', $1, true), set_config('app.active_role', $2, true)", [
      ctx.userId ?? "",
      ctx.role ?? "",
    ]);
    const result = await fn(wrap(client, ctx.userId));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw toAppError(e);
  } finally {
    client.release();
  }
}

/** Privileged connection (no RLS). Only for migrations, seeding and tests. */
export async function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(wrap(client, null));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
