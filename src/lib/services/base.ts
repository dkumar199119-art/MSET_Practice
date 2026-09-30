import type { z } from "zod";
import { withUser, type Db } from "../db";
import { AppError } from "../errors";
import { primaryRole, type CurrentUser, type Role } from "../rbac";

export type Actor = Pick<CurrentUser, "id" | "roles">;

/** Run a unit of work as the actor (RLS-enforced transaction). */
export function tx<T>(actor: Actor, fn: (db: Db) => Promise<T>, actingRole?: Role): Promise<T> {
  return withUser({ userId: actor.id, role: actingRole ?? primaryRole(actor) }, fn);
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`).join("; ");
    throw new AppError(msg, "VALIDATION", r.error.issues);
  }
  return r.data;
}

export function ensure(cond: unknown, message: string, code: AppError["code"] = "VALIDATION"): asserts cond {
  if (!cond) throw new AppError(message, code);
}

export async function logEvent(db: Db, action: string, entity: string, entityId: string | null, offeringId: string | null, data?: unknown) {
  await db.query("select app.log_event($1, $2, $3, $4, null, $5)", [action, entity, entityId, offeringId, data === undefined ? null : JSON.stringify(data)]);
}

export async function notify(db: Db, userId: string, title: string, body: string, link: string | null) {
  await db.query("select app.notify($1, $2, $3, $4)", [userId, title, body, link]);
}

export async function assertEditable(db: Db, offeringId: string) {
  const o = await db.maybe<{ status: string; editable: boolean }>(
    "select status, app.can_edit_offering(id) as editable from course_offerings where id = $1",
    [offeringId],
  );
  ensure(o, "Course offering not found or not accessible", "NOT_FOUND");
  ensure(o.editable, "Only faculty assigned to this course can change its academic data", "FORBIDDEN");
  ensure(["DRAFT", "RETURNED"].includes(o.status), `Course is ${o.status} — academic data is locked. Request a revision to make changes.`, "LOCKED");
}
