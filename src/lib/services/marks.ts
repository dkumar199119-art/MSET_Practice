import { z } from "zod";
import type { Db } from "../db";
import { validateMarksRows, type MarksRowRaw, type MarksValidationContext, type MarksValidationResult, MARKS_FIELDS } from "../domain/marks";
import { assertEditable, ensure, logEvent, parse, tx, type Actor } from "./base";

const rowSchema = z.object({
  rowNumber: z.number().int().min(0),
  values: z.object(Object.fromEntries(MARKS_FIELDS.map((f) => [f, z.union([z.string(), z.number(), z.null()]).optional()]))),
});
export const marksUploadSchema = z.object({
  offeringId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  columnMapping: z.record(z.string(), z.string()).default({}),
  rows: z.array(rowSchema).min(1, "The file contains no data rows").max(50000),
});

async function buildContext(db: Db, offeringId: string): Promise<MarksValidationContext> {
  const course = await db.one<{ code: string; institution_id: string }>(
    "select c.code, s.institution_id from course_offerings o join courses c on c.id = o.course_id join programs p on p.id = c.program_id join departments d on d.id = p.department_id join schools s on s.id = d.school_id where o.id = $1",
    [offeringId],
  );
  const enrolled = await db.query<{ id: string; roll_no: string; full_name: string }>(
    "select s.id, s.roll_no, s.full_name from enrollments e join students s on s.id = e.student_id where e.offering_id = $1 and e.status = 'ENROLLED'",
    [offeringId],
  );
  // Students of the institution visible to the faculty (to distinguish "unknown" from "not enrolled")
  const known = await db.query<{ id: string; roll_no: string; full_name: string }>("select id, roll_no, full_name from students where institution_id = $1", [course.institution_id]);
  const students = new Map<string, { id: string; name: string }>();
  for (const s of [...known, ...enrolled]) students.set(s.roll_no.toLowerCase(), { id: s.id, name: s.full_name });
  const qs = await db.query<{ aid: string; aname: string; qid: string; label: string; max_marks: number; mapped: boolean }>(`
    select a.id aid, a.name aname, q.id qid, q.label, q.max_marks,
      exists (select 1 from question_co_mappings m where m.question_id = q.id) mapped
    from assessments a join assessment_questions q on q.assessment_id = a.id where a.offering_id = $1`, [offeringId]);
  const assessments: MarksValidationContext["assessments"] = new Map();
  for (const q of qs) {
    const k = q.aname.toLowerCase();
    if (!assessments.has(k)) assessments.set(k, { id: q.aid, name: q.aname, questions: new Map() });
    assessments.get(k)!.questions.set(q.label.toLowerCase(), { id: q.qid, label: q.label, maxMarks: q.max_marks, mapped: q.mapped });
  }
  return { courseCode: course.code, students, enrolledStudentIds: new Set(enrolled.map((e) => e.id)), assessments };
}

/** Step "Validate": server-side, authoritative validation; nothing is saved. */
export async function validateMarks(actor: Actor, input: z.input<typeof marksUploadSchema>): Promise<MarksValidationResult> {
  const d = parse(marksUploadSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const ctx = await buildContext(db, d.offeringId);
    return validateMarksRows(d.rows as MarksRowRaw[], ctx);
  });
}

/** Step "Confirm → Save": re-validates and refuses to save if any error exists. */
export async function saveMarks(actor: Actor, input: z.input<typeof marksUploadSchema>) {
  const d = parse(marksUploadSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const ctx = await buildContext(db, d.offeringId);
    const result = validateMarksRows(d.rows as MarksRowRaw[], ctx);
    ensure(result.errors.length === 0, `The file has ${result.errors.length} error(s). Fix them and upload again — invalid records are never accepted.`);
    ensure(result.valid.length > 0, "No valid marks found in the file");
    const upload = await db.one<{ id: string }>(
      "insert into marks_uploads (offering_id, file_name, total_rows, saved_rows, column_mapping, summary, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [d.offeringId, d.fileName, result.summary.totalRows, result.valid.length, JSON.stringify(d.columnMapping), JSON.stringify({ ...result.summary, warnings: result.warnings.length }), actor.id],
    );
    // batched upsert
    const chunk = 500;
    for (let i = 0; i < result.valid.length; i += chunk) {
      const part = result.valid.slice(i, i + chunk);
      await db.query(
        `insert into student_marks (offering_id, student_id, question_id, marks, upload_id)
         select $1, x.student_id, x.question_id, x.marks, $2
         from jsonb_to_recordset($3::jsonb) as x(student_id uuid, question_id uuid, marks numeric)
         on conflict (student_id, question_id) do update set marks = excluded.marks, upload_id = excluded.upload_id`,
        [d.offeringId, upload.id, JSON.stringify(part.map((v) => ({ student_id: v.studentId, question_id: v.questionId, marks: v.marks })))],
      );
    }
    await logEvent(db, "MARKS_UPLOADED", "marks_uploads", upload.id, d.offeringId, { file: d.fileName, saved: result.valid.length, warnings: result.warnings.length });
    return { uploadId: upload.id, saved: result.valid.length, warnings: result.warnings };
  }, "FACULTY");
}

export function getMarksOverview(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const uploads = await db.query<{ id: string; file_name: string; saved_rows: number; total_rows: number; created_at: string; uploaded_by_name: string }>(
      "select mu.id, mu.file_name, mu.saved_rows, mu.total_rows, mu.created_at::text, u.full_name uploaded_by_name from marks_uploads mu join users u on u.id = mu.uploaded_by where mu.offering_id = $1 order by mu.created_at desc",
      [offeringId],
    );
    const perQuestion = await db.query<{ assessment: string; label: string; max_marks: number; entries: number; avg: number | null }>(`
      select a.name assessment, q.label, q.max_marks, count(sm.id)::int entries, round(avg(sm.marks), 2) avg
      from assessments a join assessment_questions q on q.assessment_id = a.id left join student_marks sm on sm.question_id = q.id
      where a.offering_id = $1 group by a.name, a.sort_order, q.label, q.sort_order, q.max_marks order by a.sort_order, q.sort_order`, [offeringId]);
    const enrolled = await db.one<{ n: number }>("select count(*)::int n from enrollments where offering_id = $1 and status = 'ENROLLED'", [offeringId]);
    return { uploads, perQuestion, enrolled: enrolled.n };
  });
}

/** Data for the downloadable Excel template (long format, pre-filled). */
export function getMarksTemplate(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const course = await db.one<{ code: string; name: string; section: string }>("select c.code, c.name, o.section from course_offerings o join courses c on c.id = o.course_id where o.id = $1", [offeringId]);
    const students = await db.query<{ roll_no: string; full_name: string }>(
      "select s.roll_no, s.full_name from enrollments e join students s on s.id = e.student_id where e.offering_id = $1 and e.status = 'ENROLLED' order by s.roll_no", [offeringId]);
    const questions = await db.query<{ assessment: string; label: string; max_marks: number }>(
      "select a.name assessment, q.label, q.max_marks from assessments a join assessment_questions q on q.assessment_id = a.id where a.offering_id = $1 order by a.sort_order, q.sort_order", [offeringId]);
    return { course, students, questions };
  });
}
