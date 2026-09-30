/** CO-based course feedback (indirect assessment). */
import { z } from "zod";
import { AppError } from "../errors";
import { assertEditable, ensure, logEvent, parse, tx, type Actor } from "./base";
import { loadSettings } from "./workspace";

export const feedbackQuestionText = (coCode: string, description: string) => `The course helped me achieve ${coCode}: ${description}`;

/** Generates the feedback form from the current COs and opens it to enrolled students. */
export async function publishFeedback(actor: Actor, offeringId: string) {
  parse(z.string().uuid(), offeringId);
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    const settings = await loadSettings(db);
    const cos = await db.query<{ id: string; code: string; description: string }>("select id, code, description from course_outcomes where offering_id = $1 order by sort_order", [offeringId]);
    ensure(cos.length > 0, "Define course outcomes before publishing feedback");
    const course = await db.one<{ code: string; name: string }>("select c.code, c.name from course_offerings o join courses c on c.id = o.course_id where o.id = $1", [offeringId]);
    let t = await db.maybe<{ id: string; status: string }>("select id, status from feedback_templates where offering_id = $1", [offeringId]);
    const responses = t ? (await db.one<{ n: number }>("select count(*)::int n from feedback_submissions where template_id = $1", [t.id])).n : 0;
    if (!t) {
      t = await db.one<{ id: string; status: string }>(
        "insert into feedback_templates (offering_id, title, scale_max, status, opened_at, created_by) values ($1,$2,$3,'OPEN',now(),$4) returning id, status",
        [offeringId, `${course.code} ${course.name} — Course Outcome Feedback`, settings.feedback_scale_max, actor.id]);
    } else {
      await db.query("update feedback_templates set status = 'OPEN', opened_at = coalesce(opened_at, now()), closed_at = null where id = $1", [t.id]);
    }
    // sync questions to COs (only regenerate text/questions while no responses exist)
    const existing = await db.query<{ id: string; co_id: string }>("select id, co_id from feedback_questions where template_id = $1", [t.id]);
    let i = 0;
    for (const co of cos) {
      i++;
      const q = existing.find((e) => e.co_id === co.id);
      if (q) {
        if (responses === 0) await db.query("update feedback_questions set text = $2, sort_order = $3 where id = $1", [q.id, feedbackQuestionText(co.code, co.description), i]);
      } else {
        await db.query("insert into feedback_questions (template_id, offering_id, co_id, text, sort_order) values ($1,$2,$3,$4,$5)", [t.id, offeringId, co.id, feedbackQuestionText(co.code, co.description), i]);
      }
    }
    if (responses === 0) {
      for (const e of existing) if (!cos.some((c) => c.id === e.co_id)) await db.query("delete from feedback_questions where id = $1", [e.id]);
    }
    const students = await db.query<{ user_id: string | null }>("select s.user_id from enrollments e join students s on s.id = e.student_id where e.offering_id = $1 and e.status = 'ENROLLED' and s.user_id is not null", [offeringId]);
    for (const s of students) await db.query("select app.notify($1,$2,$3,$4)", [s.user_id, "Course feedback open", `Please complete the course outcome feedback for ${course.code} ${course.name}.`, `/student/feedback/${offeringId}`]);
    await logEvent(db, "FEEDBACK_PUBLISHED", "feedback_templates", t.id, offeringId, { questions: cos.length });
    return t.id;
  }, "FACULTY");
}

export async function closeFeedback(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    await db.query("update feedback_templates set status = 'CLOSED', closed_at = now() where offering_id = $1 and status = 'OPEN'", [offeringId]);
  }, "FACULTY");
}

export function getFeedbackStatus(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const template = await db.maybe<{ id: string; title: string; status: string; scale_max: number; opened_at: string | null; closed_at: string | null }>(
      "select id, title, status, scale_max, opened_at::text, closed_at::text from feedback_templates where offering_id = $1", [offeringId]);
    const enrolled = (await db.one<{ n: number }>("select count(*)::int n from enrollments where offering_id = $1 and status = 'ENROLLED'", [offeringId])).n;
    if (!template) return { template: null, enrolled, submitted: 0, questions: [] };
    const submitted = (await db.one<{ n: number }>("select count(*)::int n from feedback_submissions where template_id = $1", [template.id])).n;
    const questions = await db.query<{ id: string; text: string; co_code: string; responses: number; mean: number | null }>(`
      select q.id, q.text, co.code co_code, count(r.id)::int responses, round(avg(r.rating), 2) mean
      from feedback_questions q join course_outcomes co on co.id = q.co_id left join feedback_responses r on r.question_id = q.id
      where q.template_id = $1 group by q.id, q.text, co.code, q.sort_order order by q.sort_order`, [template.id]);
    return { template, enrolled, submitted, questions };
  });
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------
export function listStudentCourses(actor: Actor) {
  return tx(actor, async (db) => {
    const sid = (await db.maybe<{ id: string }>("select app.current_student_id() id"))?.id;
    if (!sid) return [];
    return db.query<{ offering_id: string; course_code: string; course_name: string; semester: string; academic_year: string; section: string; feedback_status: string | null; submitted: boolean; faculty: string | null }>(`
      select o.id offering_id, c.code course_code, c.name course_name, sem.name semester, ay.name academic_year, o.section,
        ft.status feedback_status,
        exists (select 1 from feedback_submissions fs where fs.template_id = ft.id and fs.student_id = $1) submitted,
        (select string_agg(u.full_name, ', ') from faculty_assignments fa join users u on u.id = fa.user_id where fa.offering_id = o.id and fa.is_active) faculty
      from enrollments e join course_offerings o on o.id = e.offering_id join courses c on c.id = o.course_id
      join semesters sem on sem.id = o.semester_id join academic_years ay on ay.id = o.academic_year_id
      left join feedback_templates ft on ft.offering_id = o.id
      where e.student_id = $1 and e.status = 'ENROLLED' order by ay.start_date desc, c.code`, [sid]);
  }, "STUDENT");
}

export function getStudentFeedbackForm(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const sid = (await db.maybe<{ id: string }>("select app.current_student_id() id"))?.id;
    if (!sid) throw new AppError("Only students can open course feedback", "FORBIDDEN");
    const t = await db.maybe<{ id: string; title: string; status: string; scale_max: number }>("select id, title, status, scale_max from feedback_templates where offering_id = $1", [offeringId]);
    if (!t) throw new AppError("Feedback has not been opened for this course yet", "NOT_FOUND");
    const submitted = !!(await db.maybe("select 1 from feedback_submissions where template_id = $1 and student_id = $2", [t.id, sid]));
    const questions = await db.query<{ id: string; text: string }>("select id, text from feedback_questions where template_id = $1 order by sort_order", [t.id]);
    return { template: t, submitted, questions };
  }, "STUDENT");
}

export const submitFeedbackSchema = z.object({ templateId: z.string().uuid(), ratings: z.record(z.string().uuid(), z.coerce.number().int().min(1).max(10)) });
export async function submitFeedback(actor: Actor, input: z.input<typeof submitFeedbackSchema>) {
  const d = parse(submitFeedbackSchema, input);
  return tx(actor, (db) => db.query("select app.submit_feedback($1, $2)", [d.templateId, JSON.stringify(d.ratings)]), "STUDENT");
}
