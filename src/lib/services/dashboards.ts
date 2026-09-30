/** Role dashboards: Program Coordinator, HOD, IQAC completion & attainment monitors. */
import { z } from "zod";
import { computeCompletion, type Progress } from "../domain/completion";
import { parse, tx, type Actor } from "./base";
import { loadSettings } from "./workspace";

export const overviewFilterSchema = z.object({
  academicYearId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  facultyId: z.string().uuid().optional(),
});
export type OverviewFilter = z.infer<typeof overviewFilterSchema>;

export interface OfferingOverview {
  id: string; course_id: string; course_code: string; course_name: string; credits: number;
  program_id: string; program_code: string; department_id: string; department_name: string; school_id: string; school_name: string;
  academic_year: string; semester: string; batch: string; section: string; status: string; review_stage: string | null;
  faculty: string | null; enrolled: number; feedback_submitted: number;
  avg_final: number | null; cos_below: number; open_action_plans: number; evidence_count: number;
  progress: Progress; completion: number; missing: string[];
}

export function offeringsOverview(actor: Actor, filterInput: OverviewFilter = {}) {
  const f = parse(overviewFilterSchema, filterInput);
  return tx(actor, async (db) => {
    const settings = await loadSettings(db);
    const rows = await db.query<Omit<OfferingOverview, "progress" | "completion" | "missing"> & { progress: Progress }>(`
      select o.id, c.id course_id, c.code course_code, c.name course_name, c.credits, p.id program_id, p.code program_code,
        d.id department_id, d.name department_name, s.id school_id, s.name school_name,
        ay.name academic_year, sem.name semester, b.name batch, o.section, o.status, o.review_stage,
        (select string_agg(u.full_name, ', ') from faculty_assignments fa join users u on u.id = fa.user_id where fa.offering_id = o.id and fa.is_active) faculty,
        (select count(*)::int from enrollments e where e.offering_id = o.id and e.status = 'ENROLLED') enrolled,
        (select count(*)::int from feedback_submissions fs where fs.offering_id = o.id) feedback_submitted,
        (select round(avg(ca.final_pct), 2) from course_attainment ca where ca.offering_id = o.id and ca.is_current) avg_final,
        (select count(*)::int from course_attainment ca where ca.offering_id = o.id and ca.is_current and ca.status in ('BELOW_TARGET','CRITICAL')) cos_below,
        (select count(*)::int from action_plans ap where ap.offering_id = o.id and ap.status not in ('CLOSED','REVIEWED')) open_action_plans,
        (select count(*)::int from evidence ev where ev.offering_id = o.id) evidence_count,
        app.offering_progress(o.id) progress
      from course_offerings o join courses c on c.id = o.course_id join programs p on p.id = c.program_id
      join departments d on d.id = p.department_id join schools s on s.id = d.school_id
      join academic_years ay on ay.id = o.academic_year_id join semesters sem on sem.id = o.semester_id join batches b on b.id = o.batch_id
      where ($1::uuid is null or o.academic_year_id = $1) and ($2::uuid is null or o.semester_id = $2)
        and ($3::uuid is null or s.id = $3) and ($4::uuid is null or d.id = $4) and ($5::uuid is null or p.id = $5)
        and ($6::uuid is null or o.batch_id = $6) and ($7::uuid is null or c.id = $7)
        and ($8::uuid is null or exists (select 1 from faculty_assignments fa where fa.offering_id = o.id and fa.user_id = $8 and fa.is_active))
      order by s.name, d.name, p.code, c.code, o.section`,
      [f.academicYearId ?? null, f.semesterId ?? null, f.schoolId ?? null, f.departmentId ?? null, f.programId ?? null, f.batchId ?? null, f.courseId ?? null, f.facultyId ?? null]);
    return rows.map((r) => {
      const c = computeCompletion(r.progress, settings.completion_weights);
      return { ...r, completion: c.percent, missing: c.missing.map((m) => m.label) };
    });
  });
}

export function summarize(rows: OfferingOverview[]) {
  const n = rows.length || 1;
  const pctOf = (k: keyof Progress) => Math.round((rows.filter((r) => r.progress[k]).length / n) * 100);
  const submittedStatuses = ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW", "APPROVED", "LOCKED"];
  return {
    offerings: rows.length,
    courses: new Set(rows.map((r) => r.course_id)).size,
    programs: new Set(rows.map((r) => r.program_id)).size,
    avgCompletion: rows.length ? Math.round(rows.reduce((a, r) => a + r.completion, 0) / rows.length) : 0,
    camCompletion: rows.length ? Math.round((rows.filter((r) => r.progress.co_po && r.progress.co_pso).length / n) * 100) : 0,
    assessmentCompletion: rows.length ? Math.round((rows.filter((r) => r.progress.assessments && r.progress.question_mapping).length / n) * 100) : 0,
    attainmentCompletion: rows.length ? pctOf("final") : 0,
    feedbackCompletion: rows.length ? pctOf("feedback") : 0,
    submissionRate: rows.length ? Math.round((rows.filter((r) => submittedStatuses.includes(r.status)).length / n) * 100) : 0,
    approvalRate: rows.length ? Math.round((rows.filter((r) => r.status === "LOCKED" || r.status === "APPROVED").length / n) * 100) : 0,
    evidenceCompletion: rows.length ? Math.round((rows.filter((r) => r.evidence_count > 0).length / n) * 100) : 0,
    pending: rows.filter((r) => ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW"].includes(r.status)).length,
    returned: rows.filter((r) => r.status === "RETURNED").length,
    approved: rows.filter((r) => r.status === "LOCKED" || r.status === "APPROVED").length,
    draft: rows.filter((r) => r.status === "DRAFT").length,
    cosBelow: rows.reduce((a, r) => a + r.cos_below, 0),
    openActionPlans: rows.reduce((a, r) => a + r.open_action_plans, 0),
  };
}

/** Current program-level PO/PSO attainment + gap counts for readable programs. */
export function programOutcomeSummary(actor: Actor, academicYearId?: string) {
  return tx(actor, async (db) => {
    const po = await db.query<{ program_id: string; program_code: string; kind: string; code: string; value_pct: number | null; target_pct: number; gap: number | null; status: string }>(`
      select p.id program_id, p.code program_code, 'PO' kind, o.code, a.value_pct, a.target_pct, a.gap, a.status
      from po_attainment a join program_outcomes o on o.id = a.po_id join programs p on p.id = a.program_id
      where a.is_current and ($1::uuid is null or a.academic_year_id = $1)
      union all
      select p.id, p.code, 'PSO', o.code, a.value_pct, a.target_pct, a.gap, a.status
      from pso_attainment a join program_specific_outcomes o on o.id = a.pso_id join programs p on p.id = a.program_id
      where a.is_current and ($1::uuid is null or a.academic_year_id = $1)
      order by 2, 3, 4`, [academicYearId ?? null]);
    const actionPlans = await db.query<{ status: string; n: number; overdue: number }>(`
      select status, count(*)::int n, count(*) filter (where target_date < current_date and status not in ('CLOSED','REVIEWED','IMPLEMENTED'))::int overdue
      from action_plans group by status`);
    return { outcomes: po, actionPlans };
  });
}

export function filterOptions(actor: Actor) {
  return tx(actor, async (db) => ({
    years: await db.query<{ id: string; name: string; is_current: boolean }>("select id, name, is_current from academic_years order by start_date desc"),
    semesters: await db.query<{ id: string; name: string; academic_year_id: string }>("select id, name, academic_year_id from semesters order by name"),
    schools: await db.query<{ id: string; name: string }>("select id, name from schools order by name"),
    departments: await db.query<{ id: string; name: string; school_id: string }>("select id, name, school_id from departments order by name"),
    programs: await db.query<{ id: string; code: string; name: string; department_id: string }>("select id, code, name, department_id from programs order by code"),
    batches: await db.query<{ id: string; name: string }>("select id, name from batches order by start_year desc"),
    courses: await db.query<{ id: string; code: string; name: string; program_id: string }>("select id, code, name, program_id from courses order by code"),
    faculty: await db.query<{ id: string; full_name: string }>(
      "select distinct u.id, u.full_name from faculty_assignments fa join users u on u.id = fa.user_id where fa.is_active order by u.full_name"),
  }));
}

export function institutionCounts(actor: Actor) {
  return tx(actor, (db) => db.one<{ schools: number; departments: number; programs: number; courses: number; faculty: number; students: number }>(`
    select (select count(*)::int from schools) schools, (select count(*)::int from departments) departments,
      (select count(*)::int from programs) programs, (select count(*)::int from courses) courses,
      (select count(distinct user_id)::int from faculty_assignments where is_active) faculty,
      (select count(*)::int from students) students`));
}

export function recentNotifications(actor: Actor) {
  return tx(actor, (db) => db.query<{ id: string; title: string; body: string; link: string | null; is_read: boolean; created_at: string }>(
    "select id, title, body, link, is_read, created_at::text from notifications where user_id = $1 order by created_at desc limit 20", [actor.id]));
}

export function markNotificationsRead(actor: Actor) {
  return tx(actor, (db) => db.query("update notifications set is_read = true where user_id = $1 and not is_read", [actor.id]));
}

export function unreadCount(actor: Actor) {
  return tx(actor, async (db) => (await db.one<{ n: number }>("select count(*)::int n from notifications where user_id = $1 and not is_read", [actor.id])).n);
}
