/** Submission, multi-stage review, approval/locking and revision workflow. */
import { z } from "zod";
import { submissionChecklist, type Progress } from "../domain/completion";
import { AppError } from "../errors";
import { ensure, parse, tx, type Actor } from "./base";

export async function submitForReview(actor: Actor, offeringId: string, comment?: string) {
  parse(z.string().uuid(), offeringId);
  return tx(actor, async (db) => {
    const p = (await db.one<{ p: Progress }>("select app.offering_progress($1) p", [offeringId])).p;
    const missing = submissionChecklist(p).filter((i) => !i.done);
    if (missing.length) {
      throw new AppError(`Course cannot be submitted yet. Incomplete: ${missing.map((m) => m.label).join(", ")}`, "WORKFLOW", missing);
    }
    ensure(!p.stale, "Attainment is out of date with the latest data. Recalculate before submitting.", "WORKFLOW");
    const r = await db.one<{ s: string }>("select app.transition_offering($1, 'SUBMIT', $2) s", [offeringId, comment ?? null]);
    return r.s;
  }, "FACULTY");
}

export const reviewSchema = z.object({
  offeringId: z.string().uuid(),
  decision: z.enum(["APPROVE", "RETURN"]),
  comment: z.string().max(4000).optional().nullable(),
});

export async function reviewOffering(actor: Actor, input: z.input<typeof reviewSchema>) {
  const d = parse(reviewSchema, input);
  if (d.decision === "RETURN") ensure((d.comment ?? "").trim().length >= 5, "Explain what must be corrected (comment required)");
  return tx(actor, async (db) => {
    const r = await db.one<{ s: string }>("select app.transition_offering($1, $2, $3) s", [d.offeringId, d.decision, d.comment ?? null]);
    return r.s;
  }, "PROGRAM_COORDINATOR");
}

export async function requestRevision(actor: Actor, offeringId: string, reason: string) {
  ensure(reason.trim().length >= 10, "A reason of at least 10 characters is required");
  return tx(actor, (db) => db.one<{ id: string }>("select app.request_revision($1, $2) id", [offeringId, reason.trim()]), "FACULTY");
}

export async function decideRevision(actor: Actor, requestId: string, approve: boolean, comment?: string) {
  return tx(actor, (db) => db.one<{ s: string }>("select app.decide_revision($1, $2, $3) s", [requestId, approve, comment ?? null]), "PROGRAM_COORDINATOR");
}

export function getWorkflowHistory(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => ({
    history: await db.query<{ id: string; action: string; from_status: string; to_status: string; stage: string | null; actor_name: string; actor_role: string; comments: string | null; version: number; created_at: string }>(`
      select w.id, w.action, w.from_status, w.to_status, w.stage, u.full_name actor_name, w.actor_role, w.comments, w.version, w.created_at::text
      from approval_workflows w join users u on u.id = w.actor_id where w.offering_id = $1 order by w.created_at desc`, [offeringId]),
    versions: await db.query<{ version: number; label: string; created_at: string; created_by_name: string | null }>(`
      select v.version, v.label, v.created_at::text, u.full_name created_by_name from offering_versions v left join users u on u.id = v.created_by
      where v.offering_id = $1 order by v.version desc`, [offeringId]),
    revisions: await db.query<{ id: string; reason: string; status: string; requested_by_name: string; decided_by_name: string | null; decision_comment: string | null; created_at: string }>(`
      select r.id, r.reason, r.status, u.full_name requested_by_name, d.full_name decided_by_name, r.decision_comment, r.created_at::text
      from revision_requests r join users u on u.id = r.requested_by left join users d on d.id = r.decided_by where r.offering_id = $1 order by r.created_at desc`, [offeringId]),
  }));
}

export function getVersionSnapshot(actor: Actor, offeringId: string, version: number) {
  return tx(actor, (db) => db.maybe<{ label: string; snapshot: Record<string, unknown>; created_at: string }>(
    "select label, snapshot, created_at::text from offering_versions where offering_id = $1 and version = $2", [offeringId, version]));
}

export interface ReviewQueueRow {
  id: string; course_code: string; course_name: string; program_code: string; academic_year: string; semester: string; section: string;
  status: string; review_stage: string | null; faculty: string | null; submitted_at: string | null; my_stage: boolean;
}

/** Offerings awaiting review where the actor is the reviewer of the current stage, plus pending revision requests. */
export function getReviewQueue(actor: Actor) {
  return tx(actor, async (db) => {
    const rows = await db.query<ReviewQueueRow>(`
      select o.id, c.code course_code, c.name course_name, p.code program_code, ay.name academic_year, sem.name semester, o.section,
        o.status, o.review_stage, o.submitted_at::text,
        (select string_agg(u.full_name, ', ') from faculty_assignments fa join users u on u.id = fa.user_id where fa.offering_id = o.id and fa.is_active) faculty,
        case o.review_stage
          when 'COURSE_COORDINATOR' then app.is_cc_of(c.id)
          when 'PROGRAM_COORDINATOR' then app.is_pc_of(p.id)
          when 'HOD' then app.is_hod_of(p.department_id) else false end or app.is_admin() my_stage
      from course_offerings o join courses c on c.id = o.course_id join programs p on p.id = c.program_id
      join academic_years ay on ay.id = o.academic_year_id join semesters sem on sem.id = o.semester_id
      where o.status in ('SUBMITTED','RESUBMITTED','UNDER_REVIEW') and app.can_review_offering(o.id)
      order by my_stage desc, o.submitted_at`);
    const revisions = await db.query<{ id: string; offering_id: string; course_code: string; reason: string; requested_by_name: string; created_at: string; can_decide: boolean }>(`
      select r.id, r.offering_id, c.code course_code, r.reason, u.full_name requested_by_name, r.created_at::text,
        (app.is_pc_of(c.program_id) or app.is_hod_of(app.program_department(c.program_id)) or app.is_admin()) can_decide
      from revision_requests r join course_offerings o on o.id = r.offering_id join courses c on c.id = o.course_id join users u on u.id = r.requested_by
      where r.status = 'PENDING' order by r.created_at`);
    const recent = await db.query<{ id: string; course_code: string; action: string; to_status: string; actor_name: string; created_at: string }>(`
      select o.id, c.code course_code, w.action, w.to_status, u.full_name actor_name, w.created_at::text
      from approval_workflows w join course_offerings o on o.id = w.offering_id join courses c on c.id = o.course_id join users u on u.id = w.actor_id
      where app.can_review_offering(o.id) order by w.created_at desc limit 15`);
    return { rows, revisions, recent };
  });
}
