import { z } from "zod";
import { AppError } from "../errors";
import { getObject, putObject } from "../storage";
import { ensure, parse, tx, type Actor } from "./base";

export const EVIDENCE_TYPES = ["SYLLABUS", "LESSON_PLAN", "QUESTION_PAPER", "MARKS", "STUDENT_WORK", "LAB_RECORD", "ASSIGNMENT", "FEEDBACK", "ATTAINMENT_REPORT", "ACTION_TAKEN_REPORT", "OTHER"] as const;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/plain",
  "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export const evidenceSchema = z.object({
  offeringId: z.string().uuid(),
  evidenceType: z.enum(EVIDENCE_TYPES),
  title: z.string().trim().min(3).max(200),
});

export async function uploadEvidence(actor: Actor, input: z.input<typeof evidenceSchema>, file: { name: string; type: string; data: Buffer }) {
  const d = parse(evidenceSchema, input);
  ensure(file.data.length > 0, "The file is empty");
  ensure(file.data.length <= MAX_EVIDENCE_BYTES, "Files must be 10 MB or smaller");
  ensure(ALLOWED_MIME.includes(file.type), `File type ${file.type || "unknown"} is not allowed`);
  return tx(actor, async (db) => {
    const ok = await db.one<{ ok: boolean; ay: string }>("select app.can_edit_offering($1) ok, academic_year_id ay from course_offerings where id = $1", [d.offeringId]);
    ensure(ok.ok, "Only faculty assigned to this course can upload evidence", "FORBIDDEN");
    const prog = await db.one<{ program_id: string }>("select c.program_id from course_offerings o join courses c on c.id = o.course_id where o.id = $1", [d.offeringId]);
    const version = (await db.one<{ n: number }>("select count(*)::int + 1 n from evidence where offering_id = $1 and evidence_type = $2", [d.offeringId, d.evidenceType])).n;
    const stored = await putObject(`offerings/${d.offeringId}`, file.name, file.data, file.type);
    const r = await db.one<{ id: string }>(
      `insert into evidence (offering_id, program_id, academic_year_id, evidence_type, title, file_name, mime_type, size_bytes, storage_path, sha256, version, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [d.offeringId, prog.program_id, ok.ay, d.evidenceType, d.title, file.name, file.type, file.data.length, stored.storagePath, stored.sha256, version, actor.id]);
    return r.id;
  }, "FACULTY");
}

export function listEvidence(actor: Actor, offeringId: string) {
  return tx(actor, (db) => db.query<{ id: string; evidence_type: string; title: string; file_name: string; size_bytes: number; version: number; uploaded_by_name: string; created_at: string }>(`
    select e.id, e.evidence_type, e.title, e.file_name, e.size_bytes, e.version, u.full_name uploaded_by_name, e.created_at::text
    from evidence e join users u on u.id = e.uploaded_by where e.offering_id = $1 order by e.created_at desc`, [offeringId]));
}

export async function downloadEvidence(actor: Actor, evidenceId: string) {
  const row = await tx(actor, (db) => db.maybe<{ file_name: string; mime_type: string; storage_path: string }>("select file_name, mime_type, storage_path from evidence where id = $1", [evidenceId]));
  if (!row) throw new AppError("Evidence not found or not accessible", "NOT_FOUND");
  return { ...row, data: await getObject(row.storage_path) };
}

export async function deleteEvidence(actor: Actor, evidenceId: string) {
  return tx(actor, async (db) => {
    const r = await db.query("delete from evidence where id = $1 returning id", [evidenceId]);
    ensure(r.length === 1, "Only the uploader can delete evidence, and only while the course is editable", "FORBIDDEN");
  });
}
