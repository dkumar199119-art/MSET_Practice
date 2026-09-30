/**
 * Faculty course workspace: context, progress, and the academic content that
 * faculty complete (syllabus, objectives, COs, Bloom, targets, CAM,
 * assessments, question mapping, enrollment). All writes are RLS-scoped to
 * assigned faculty / course coordinator and trigger-locked after submission.
 */
import { z } from "zod";
import type { Db } from "../db";
import { AppError } from "../errors";
import { BLOOM_LEVELS, checkMeasurability } from "../domain/bloom";
import { computeCompletion, DEFAULT_COMPLETION_WEIGHTS, type Progress } from "../domain/completion";
import { resolveTarget } from "../domain/attainment";
import { sanitizeHtml } from "../sanitize";
import { matrixCoverage } from "../domain/coverage";
import { assertEditable, ensure, logEvent, parse, tx, type Actor } from "./base";

const uuid = z.string().uuid();

export interface OfferingContext {
  id: string;
  status: string;
  review_stage: string | null;
  version: number;
  section: string;
  deadline: string | null;
  profile_confirmed_at: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  semester_number: number;
  credits: number;
  lecture_hours: number;
  tutorial_hours: number;
  practical_hours: number;
  course_type: string;
  category: string;
  program_id: string;
  program_code: string;
  program_name: string;
  program_default_co_target: number | null;
  department_id: string;
  department_name: string;
  school_name: string;
  academic_year_id: string;
  academic_year: string;
  semester: string;
  batch_id: string;
  batch: string;
  faculty: { user_id: string; full_name: string; course_role: string }[];
  coordinators: { user_id: string; full_name: string }[];
  can_edit: boolean;
  can_review: boolean;
  is_assigned: boolean;
  editable: boolean;
}

export async function loadOfferingContext(db: Db, offeringId: string): Promise<OfferingContext> {
  const o = await db.maybe<OfferingContext>(`
    select o.id, o.status, o.review_stage, o.version, o.section, o.deadline::text, o.profile_confirmed_at::text,
      c.id course_id, c.code course_code, c.name course_name, c.semester_number, c.credits, c.lecture_hours, c.tutorial_hours,
      c.practical_hours, c.course_type, c.category,
      p.id program_id, p.code program_code, p.name program_name, p.default_co_target program_default_co_target,
      d.id department_id, d.name department_name, s.name school_name,
      ay.id academic_year_id, ay.name academic_year, sem.name semester, b.id batch_id, b.name batch,
      coalesce((select json_agg(json_build_object('user_id', fa.user_id, 'full_name', u.full_name, 'course_role', fa.course_role))
        from faculty_assignments fa join users u on u.id = fa.user_id where fa.offering_id = o.id and fa.is_active), '[]') faculty,
      coalesce((select json_agg(json_build_object('user_id', cc.user_id, 'full_name', u.full_name))
        from course_coordinators cc join users u on u.id = cc.user_id where cc.course_id = c.id and cc.is_active), '[]') coordinators,
      app.can_edit_offering(o.id) can_edit, app.can_review_offering(o.id) can_review, app.is_assigned_faculty(o.id) is_assigned,
      o.status in ('DRAFT','RETURNED') editable
    from course_offerings o
    join courses c on c.id = o.course_id join programs p on p.id = c.program_id
    join departments d on d.id = p.department_id join schools s on s.id = d.school_id
    join academic_years ay on ay.id = o.academic_year_id join semesters sem on sem.id = o.semester_id
    join batches b on b.id = o.batch_id
    where o.id = $1`, [offeringId]);
  if (!o) throw new AppError("Course offering not found or not accessible", "NOT_FOUND");
  return o;
}

export async function loadSettings(db: Db) {
  return db.one<{
    institution_id: string; cam_scale_max: number; cam_scale_labels: Record<string, string>; feedback_scale_max: number;
    allow_multi_co_questions: boolean; hod_approval_required: boolean; require_evidence: boolean; require_action_plan_for_gaps: boolean;
    default_co_target: number; default_po_target: number; completion_weights: Record<string, number>; ai_enabled: boolean;
    students_can_view_attainment: boolean;
  }>("select * from institution_settings limit 1");
}

export async function loadProgress(db: Db, offeringId: string) {
  const r = await db.one<{ p: Progress }>("select app.offering_progress($1) p", [offeringId]);
  const settings = await loadSettings(db);
  const completion = computeCompletion(r.p, settings.completion_weights ?? DEFAULT_COMPLETION_WEIGHTS);
  return { progress: r.p, completion };
}

export function getWorkspace(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const ctx = await loadOfferingContext(db, offeringId);
    const { progress, completion } = await loadProgress(db, offeringId);
    const settings = await loadSettings(db);
    return { ctx, progress, completion, settings };
  });
}

export interface MyCourse {
  id: string; course_code: string; course_name: string; program_code: string; semester: string; academic_year: string;
  section: string; course_role: string; status: string; deadline: string | null; progress: Progress; attainment_status: string;
}

export function listMyCourses(actor: Actor) {
  return tx(actor, async (db) => {
    const rows = await db.query<Omit<MyCourse, "progress">>(`
      select o.id, c.code course_code, c.name course_name, p.code program_code, sem.name semester, ay.name academic_year,
        o.section, string_agg(fa.course_role, ', ') course_role, o.status, o.deadline::text,
        case when exists (select 1 from course_attainment ca where ca.offering_id = o.id and ca.is_current) then 'Calculated'
             when exists (select 1 from direct_attainment da where da.offering_id = o.id and da.is_current) then 'Direct only' else 'Pending' end attainment_status
      from faculty_assignments fa join course_offerings o on o.id = fa.offering_id
      join courses c on c.id = o.course_id join programs p on p.id = c.program_id
      join semesters sem on sem.id = o.semester_id join academic_years ay on ay.id = o.academic_year_id
      where fa.user_id = $1 and fa.is_active
      group by o.id, c.code, c.name, p.code, sem.name, ay.name, ay.start_date
      order by ay.start_date desc, c.code`, [actor.id]);
    const settings = await loadSettings(db);
    const out = [];
    for (const r of rows) {
      const p = (await db.one<{ p: Progress }>("select app.offering_progress($1) p", [r.id])).p;
      out.push({ ...r, progress: p, completion: computeCompletion(p, settings.completion_weights) });
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Course profile
// ---------------------------------------------------------------------------
export async function confirmProfile(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    await db.query("update course_offerings set profile_confirmed_at = now() where id = $1", [offeringId]);
  }, "FACULTY");
}

export const correctionSchema = z.object({
  offeringId: uuid,
  field: z.string().trim().min(2).max(60),
  requestedValue: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(5).max(1000),
});
export async function requestCorrection(actor: Actor, input: z.input<typeof correctionSchema>) {
  const d = parse(correctionSchema, input);
  return tx(actor, async (db) => {
    await db.query("insert into correction_requests (offering_id, field, requested_value, reason, requested_by) values ($1,$2,$3,$4,$5)", [d.offeringId, d.field, d.requestedValue, d.reason, actor.id]);
    const pcs = await db.query<{ user_id: string }>(
      "select pc.user_id from program_coordinators pc join courses c on c.program_id = pc.program_id join course_offerings o on o.course_id = c.id where o.id = $1 and pc.is_active", [d.offeringId]);
    for (const p of pcs) await db.query("select app.notify($1,$2,$3,$4)", [p.user_id, "Profile correction requested", `${d.field}: ${d.requestedValue}`, `/workspace/${d.offeringId}/profile`]);
  }, "FACULTY");
}

export function listCorrections(actor: Actor, offeringId: string) {
  return tx(actor, (db) => db.query<{ id: string; field: string; requested_value: string; reason: string; status: string; created_at: string; requested_by_name: string }>(
    `select cr.*, u.full_name requested_by_name from correction_requests cr join users u on u.id = cr.requested_by where cr.offering_id = $1 order by cr.created_at desc`, [offeringId]));
}

// ---------------------------------------------------------------------------
// Syllabus
// ---------------------------------------------------------------------------
export const syllabusSchema = z.object({
  offeringId: uuid,
  overview: z.string().max(50000),
  teachingMethodology: z.string().max(20000),
  referenceBooks: z.string().max(20000),
  digitalResources: z.string().max(20000),
  source: z.enum(["MANUAL", "PASTE", "UPLOAD"]).default("MANUAL"),
  rawText: z.string().max(200000).optional().nullable(),
  units: z.array(z.object({
    unitNo: z.coerce.number().int().min(1).max(50),
    title: z.string().trim().min(2).max(300),
    topics: z.string().max(10000),
    hours: z.coerce.number().min(0).max(200),
  })).min(1, "Add at least one unit/module").max(50),
});

export async function saveSyllabus(actor: Actor, input: z.input<typeof syllabusSchema>) {
  const d = parse(syllabusSchema, input);
  const nums = d.units.map((u) => u.unitNo);
  ensure(new Set(nums).size === nums.length, "Unit numbers must be unique");
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    await db.query(`
      insert into syllabus (offering_id, overview, teaching_methodology, reference_books, digital_resources, source, raw_text, updated_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (offering_id) do update set overview=excluded.overview, teaching_methodology=excluded.teaching_methodology,
        reference_books=excluded.reference_books, digital_resources=excluded.digital_resources, source=excluded.source,
        raw_text=coalesce(excluded.raw_text, syllabus.raw_text), updated_by=excluded.updated_by`,
      [d.offeringId, sanitizeHtml(d.overview), d.teachingMethodology, d.referenceBooks, d.digitalResources, d.source, d.rawText ?? null, actor.id]);
    // replace units (diff to keep audit readable)
    const existing = await db.query<{ id: string; unit_no: number }>("select id, unit_no from syllabus_units where offering_id = $1", [d.offeringId]);
    for (const e of existing) if (!nums.includes(e.unit_no)) await db.query("delete from syllabus_units where id = $1", [e.id]);
    for (const u of d.units) {
      await db.query(`
        insert into syllabus_units (offering_id, unit_no, title, topics, hours) values ($1,$2,$3,$4,$5)
        on conflict (offering_id, unit_no) do update set title=excluded.title, topics=excluded.topics, hours=excluded.hours`,
        [d.offeringId, u.unitNo, u.title, u.topics, u.hours]);
    }
  }, "FACULTY");
}

export function getSyllabus(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => ({
    syllabus: await db.maybe<{ overview: string; teaching_methodology: string; reference_books: string; digital_resources: string; source: string; raw_text: string | null; updated_at: string }>(
      "select overview, teaching_methodology, reference_books, digital_resources, source, raw_text, updated_at::text from syllabus where offering_id = $1", [offeringId]),
    units: await db.query<{ unit_no: number; title: string; topics: string; hours: number }>(
      "select unit_no, title, topics, hours from syllabus_units where offering_id = $1 order by unit_no", [offeringId]),
  }));
}

// ---------------------------------------------------------------------------
// Course objectives
// ---------------------------------------------------------------------------
export const objectivesSchema = z.object({
  offeringId: uuid,
  items: z.array(z.object({
    id: uuid.optional(),
    description: z.string().trim().min(10, "Objective description is too short").max(1000),
    source: z.enum(["MANUAL", "AI_ACCEPTED", "AI_MODIFIED"]).default("MANUAL"),
    aiSuggestionId: uuid.optional().nullable(),
  })).max(20),
});

/** Saves the ordered objective list; codes are re-derived as COBJ1..n from order. */
export async function saveObjectives(actor: Actor, input: z.input<typeof objectivesSchema>) {
  const d = parse(objectivesSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const existing = await db.query<{ id: string }>("select id from course_objectives where offering_id = $1", [d.offeringId]);
    const keep = new Set(d.items.filter((i) => i.id).map((i) => i.id));
    for (const e of existing) if (!keep.has(e.id)) await db.query("delete from course_objectives where id = $1", [e.id]);
    // temporary codes to avoid unique collisions while reordering
    await releaseCodes(db, "course_objectives", "code", "offering_id", d.offeringId, d.items.map((it, idx) => [it.id, `COBJ${idx + 1}`]));
    let i = 0;
    for (const it of d.items) {
      i++;
      if (it.id) {
        await db.query("update course_objectives set code=$2, description=$3, sort_order=$4 where id=$1 and offering_id=$5", [it.id, `COBJ${i}`, it.description, i, d.offeringId]);
      } else {
        await db.query("insert into course_objectives (offering_id, code, description, sort_order, source, ai_suggestion_id) values ($1,$2,$3,$4,$5,$6)", [d.offeringId, `COBJ${i}`, it.description, i, it.source, it.aiSuggestionId ?? null]);
      }
    }
  }, "FACULTY");
}

export function getObjectives(actor: Actor, offeringId: string) {
  return tx(actor, (db) => db.query<{ id: string; code: string; description: string; source: string }>(
    "select id, code, description, source from course_objectives where offering_id = $1 order by sort_order", [offeringId]));
}

// ---------------------------------------------------------------------------
// Course outcomes (with Bloom level & targets)
// ---------------------------------------------------------------------------
export const outcomesSchema = z.object({
  offeringId: uuid,
  items: z.array(z.object({
    id: uuid.optional(),
    description: z.string().trim().min(15, "CO statement is too short").max(1000),
    bloomLevel: z.enum(BLOOM_LEVELS).nullable().optional(),
    target: z.coerce.number().min(0).max(100).nullable().optional(),
    weightage: z.coerce.number().positive().max(100).default(1),
    source: z.enum(["MANUAL", "AI_ACCEPTED", "AI_MODIFIED"]).default("MANUAL"),
    aiSuggestionId: uuid.optional().nullable(),
  })).max(20),
});

export async function saveOutcomes(actor: Actor, input: z.input<typeof outcomesSchema>) {
  const d = parse(outcomesSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const existing = await db.query<{ id: string }>("select id from course_outcomes where offering_id = $1", [d.offeringId]);
    const keep = new Set(d.items.filter((i) => i.id).map((i) => i.id));
    for (const e of existing) {
      if (!keep.has(e.id)) {
        const used = await db.maybe("select 1 from feedback_responses r join feedback_questions q on q.id = r.question_id where q.co_id = $1 limit 1", [e.id]);
        ensure(!used, "A CO with student feedback responses cannot be deleted");
        await db.query("delete from course_outcomes where id = $1", [e.id]);
      }
    }
    await releaseCodes(db, "course_outcomes", "code", "offering_id", d.offeringId, d.items.map((it, idx) => [it.id, `CO${idx + 1}`]));
    let i = 0;
    for (const it of d.items) {
      i++;
      if (it.id) {
        await db.query(
          `update course_outcomes set code=$2, description=$3, bloom_level=coalesce($4, bloom_level), target=$5, weightage=$6, sort_order=$7
           where id=$1 and offering_id=$8`,
          [it.id, `CO${i}`, it.description, it.bloomLevel ?? null, it.target ?? null, it.weightage, i, d.offeringId]);
      } else {
        await db.query(
          `insert into course_outcomes (offering_id, code, description, bloom_level, target, weightage, sort_order, source, ai_suggestion_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [d.offeringId, `CO${i}`, it.description, it.bloomLevel ?? null, it.target ?? null, it.weightage, i, it.source, it.aiSuggestionId ?? null]);
      }
    }
  }, "FACULTY");
}

export const bloomSchema = z.object({ offeringId: uuid, levels: z.record(z.string().uuid(), z.enum(BLOOM_LEVELS)) });
export async function saveBloomLevels(actor: Actor, input: z.input<typeof bloomSchema>) {
  const d = parse(bloomSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    for (const [coId, level] of Object.entries(d.levels)) {
      await db.query("update course_outcomes set bloom_level = $2 where id = $1 and offering_id = $3", [coId, level, d.offeringId]);
    }
  }, "FACULTY");
}

export const targetsSchema = z.object({
  offeringId: uuid,
  courseDefault: z.coerce.number().min(0).max(100).nullable(),
  rationale: z.string().max(2000).optional().nullable(),
  coTargets: z.record(z.string().uuid(), z.coerce.number().min(0).max(100).nullable()),
});
export async function saveTargets(actor: Actor, input: z.input<typeof targetsSchema>) {
  const d = parse(targetsSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    await db.query(`
      insert into course_targets (offering_id, default_co_target, rationale, confirmed_by) values ($1,$2,$3,$4)
      on conflict (offering_id) do update set default_co_target=excluded.default_co_target, rationale=excluded.rationale, confirmed_by=excluded.confirmed_by`,
      [d.offeringId, d.courseDefault, d.rationale ?? null, actor.id]);
    for (const [coId, t] of Object.entries(d.coTargets)) {
      await db.query("update course_outcomes set target = $2 where id = $1 and offering_id = $3", [coId, t, d.offeringId]);
    }
  }, "FACULTY");
}

export interface CoRow {
  id: string; code: string; description: string; bloom_level: string | null; target: number | null; weightage: number;
  source: string; effective_target: number; target_source: string;
}

export async function loadCos(db: Db, offeringId: string): Promise<CoRow[]> {
  const settings = await loadSettings(db);
  const t = await db.maybe<{ default_co_target: number | null }>("select default_co_target from course_targets where offering_id = $1", [offeringId]);
  const prog = await db.one<{ default_co_target: number | null }>(
    "select p.default_co_target from programs p join courses c on c.program_id = p.id join course_offerings o on o.course_id = c.id where o.id = $1", [offeringId]);
  const rows = await db.query<Omit<CoRow, "effective_target" | "target_source">>(
    "select id, code, description, bloom_level, target, weightage, source from course_outcomes where offering_id = $1 order by sort_order", [offeringId]);
  return rows.map((r) => {
    const res = resolveTarget({ co: r.target, course: t?.default_co_target, program: prog.default_co_target, institution: settings.default_co_target });
    return { ...r, effective_target: res.target, target_source: res.source };
  });
}

export function getOutcomes(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const cos = await loadCos(db, offeringId);
    const settings = await loadSettings(db);
    const courseTarget = await db.maybe<{ default_co_target: number | null; rationale: string | null }>("select default_co_target, rationale from course_targets where offering_id = $1", [offeringId]);
    const prog = await db.one<{ default_co_target: number | null }>(
      "select p.default_co_target from programs p join courses c on c.program_id = p.id join course_offerings o on o.course_id = c.id where o.id = $1", [offeringId]);
    return {
      cos: cos.map((c) => ({ ...c, check: checkMeasurability(c.description, (c.bloom_level as never) ?? null) })),
      targets: { institution: settings.default_co_target, program: prog.default_co_target, course: courseTarget?.default_co_target ?? null, rationale: courseTarget?.rationale ?? null, confirmed: !!courseTarget },
    };
  });
}

// ---------------------------------------------------------------------------
// CO-PO / CO-PSO articulation matrix
// ---------------------------------------------------------------------------
export const matrixSchema = z.object({
  offeringId: uuid,
  kind: z.enum(["PO", "PSO"]),
  /** cells[coId][outcomeId] = value */
  cells: z.record(z.string().uuid(), z.record(z.string().uuid(), z.coerce.number().int().min(0).max(5))),
  aiSuggestionId: uuid.optional().nullable(),
  aiValues: z.record(z.string(), z.record(z.string(), z.number())).optional().nullable(),
});

export async function saveMatrix(actor: Actor, input: z.input<typeof matrixSchema>) {
  const d = parse(matrixSchema, input);
  const table = d.kind === "PO" ? "co_po_mappings" : "co_pso_mappings";
  const col = d.kind === "PO" ? "po_id" : "pso_id";
  const outTable = d.kind === "PO" ? "program_outcomes" : "program_specific_outcomes";
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const settings = await loadSettings(db);
    const cos = new Set((await db.query<{ id: string }>("select id from course_outcomes where offering_id = $1", [d.offeringId])).map((r) => r.id));
    const outs = new Set((await db.query<{ id: string }>(
      `select x.id from ${outTable} x join courses c on c.program_id = x.program_id join course_offerings o on o.course_id = c.id where o.id = $1`, [d.offeringId])).map((r) => r.id));
    for (const [coId, row] of Object.entries(d.cells)) {
      ensure(cos.has(coId), "Matrix references a CO that does not belong to this course");
      for (const [outId, value] of Object.entries(row)) {
        ensure(outs.has(outId), `Matrix references a ${d.kind} outside this program`);
        ensure(value <= settings.cam_scale_max, `Mapping values must be between 0 and ${settings.cam_scale_max}`);
        const ai = d.aiValues?.[coId]?.[outId];
        const source = ai === undefined ? "MANUAL" : ai === value ? "AI_ACCEPTED" : "AI_MODIFIED";
        await db.query(`
          insert into ${table} (offering_id, co_id, ${col}, value, source, ai_suggested_value, ai_suggestion_id, updated_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (co_id, ${col}) do update set value=excluded.value,
            source = case when excluded.ai_suggested_value is null and ${table}.value = excluded.value then ${table}.source else excluded.source end,
            ai_suggested_value = coalesce(excluded.ai_suggested_value, ${table}.ai_suggested_value),
            ai_suggestion_id = coalesce(excluded.ai_suggestion_id, ${table}.ai_suggestion_id), updated_by = excluded.updated_by`,
          [d.offeringId, coId, outId, value, source, ai ?? null, d.aiSuggestionId ?? null, actor.id]);
      }
    }
    if (d.aiSuggestionId) {
      await db.query("update ai_suggestions set status = 'MODIFIED', final_value = $2, decided_by = $3, decided_at = now() where id = $1 and status = 'PENDING'",
        [d.aiSuggestionId, JSON.stringify(d.cells), actor.id]);
    }
  }, "FACULTY");
}

export function getMatrix(actor: Actor, offeringId: string, kind: "PO" | "PSO") {
  const table = kind === "PO" ? "co_po_mappings" : "co_pso_mappings";
  const col = kind === "PO" ? "po_id" : "pso_id";
  const outTable = kind === "PO" ? "program_outcomes" : "program_specific_outcomes";
  return tx(actor, async (db) => {
    const cos = await db.query<{ id: string; code: string; description: string }>("select id, code, description from course_outcomes where offering_id = $1 order by sort_order", [offeringId]);
    const outcomes = await db.query<{ id: string; code: string; title: string; description: string }>(
      `select x.id, x.code, x.title, x.description from ${outTable} x join courses c on c.program_id = x.program_id
       join course_offerings o on o.course_id = c.id where o.id = $1 order by x.sort_order, x.code`, [offeringId]);
    const cells = await db.query<{ co_id: string; outcome_id: string; value: number; source: string; ai_suggested_value: number | null }>(
      `select co_id, ${col} outcome_id, value, source, ai_suggested_value from ${table} where offering_id = $1`, [offeringId]);
    const settings = await loadSettings(db);
    return { cos, outcomes, cells, scaleMax: settings.cam_scale_max, labels: settings.cam_scale_labels, coverage: matrixCoverage(cos, outcomes, cells) };
  });
}

// ---------------------------------------------------------------------------
// Assessments, questions, question→CO mapping
// ---------------------------------------------------------------------------
export const ASSESSMENT_TYPES = ["INTERNAL", "MIDTERM", "END_SEMESTER", "QUIZ", "ASSIGNMENT", "LABORATORY", "PROJECT", "VIVA", "PRESENTATION"] as const;

export const assessmentsSchema = z.object({
  offeringId: uuid,
  items: z.array(z.object({
    id: uuid.optional(),
    name: z.string().trim().min(2).max(100),
    assessmentType: z.enum(ASSESSMENT_TYPES),
    maxMarks: z.coerce.number().positive().max(1000),
    weightage: z.coerce.number().min(0).max(100),
    assessmentDate: z.string().optional().nullable(),
    questions: z.array(z.object({
      id: uuid.optional(),
      label: z.string().trim().min(1).max(20),
      maxMarks: z.coerce.number().positive().max(1000),
      coIds: z.array(z.string().uuid()).default([]),
    })).min(1, "Each assessment needs at least one question/component"),
  })).max(30),
});

export async function saveAssessments(actor: Actor, input: z.input<typeof assessmentsSchema>) {
  const d = parse(assessmentsSchema, input);
  const names = d.items.map((i) => i.name.toLowerCase());
  ensure(new Set(names).size === names.length, "Assessment names must be unique");
  const totalWeight = d.items.reduce((a, b) => a + b.weightage, 0);
  ensure(d.items.length === 0 || totalWeight === 0 || Math.abs(totalWeight - 100) < 0.01, `Assessment weightages must total 100 (currently ${totalWeight})`);
  for (const a of d.items) {
    const labels = a.questions.map((q) => q.label.toLowerCase());
    ensure(new Set(labels).size === labels.length, `Question labels in ${a.name} must be unique`);
    const sum = a.questions.reduce((x, q) => x + q.maxMarks, 0);
    ensure(Math.abs(sum - a.maxMarks) < 0.01, `${a.name}: question maximum marks total ${sum} but assessment maximum is ${a.maxMarks}`);
  }
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const settings = await loadSettings(db);
    const cos = new Set((await db.query<{ id: string }>("select id from course_outcomes where offering_id = $1", [d.offeringId])).map((r) => r.id));
    for (const a of d.items) for (const q of a.questions) {
      ensure(settings.allow_multi_co_questions || q.coIds.length <= 1, `${a.name} ${q.label}: the institution allows only one CO per question`);
      for (const c of q.coIds) ensure(cos.has(c), "Question mapped to a CO outside this course");
    }
    const existing = await db.query<{ id: string }>("select id from assessments where offering_id = $1", [d.offeringId]);
    const keep = new Set(d.items.filter((i) => i.id).map((i) => i.id));
    for (const e of existing) {
      if (!keep.has(e.id)) {
        const hasMarks = await db.maybe("select 1 from student_marks sm join assessment_questions q on q.id = sm.question_id where q.assessment_id = $1 limit 1", [e.id]);
        ensure(!hasMarks, "An assessment with uploaded marks cannot be deleted. Remove its marks first.");
        await db.query("delete from assessments where id = $1", [e.id]);
      }
    }
    await releaseCodes(db, "assessments", "name", "offering_id", d.offeringId, d.items.map((it) => [it.id, it.name]));
    let order = 0;
    for (const a of d.items) {
      order++;
      let aid = a.id;
      if (aid) {
        await db.query("update assessments set name=$2, assessment_type=$3, max_marks=$4, weightage=$5, assessment_date=$6, sort_order=$7 where id=$1 and offering_id=$8",
          [aid, a.name, a.assessmentType, a.maxMarks, a.weightage, a.assessmentDate || null, order, d.offeringId]);
      } else {
        aid = (await db.one<{ id: string }>("insert into assessments (offering_id, name, assessment_type, max_marks, weightage, assessment_date, sort_order) values ($1,$2,$3,$4,$5,$6,$7) returning id",
          [d.offeringId, a.name, a.assessmentType, a.maxMarks, a.weightage, a.assessmentDate || null, order])).id;
      }
      const qExisting = await db.query<{ id: string }>("select id from assessment_questions where assessment_id = $1", [aid]);
      const qKeep = new Set(a.questions.filter((q) => q.id).map((q) => q.id));
      for (const e of qExisting) {
        if (!qKeep.has(e.id)) {
          const hasMarks = await db.maybe("select 1 from student_marks where question_id = $1 limit 1", [e.id]);
          ensure(!hasMarks, `A question of ${a.name} with uploaded marks cannot be deleted`);
          await db.query("delete from assessment_questions where id = $1", [e.id]);
        }
      }
      await releaseCodes(db, "assessment_questions", "label", "assessment_id", aid, a.questions.map((q) => [q.id, q.label]));
      let qo = 0;
      for (const q of a.questions) {
        qo++;
        let qid = q.id;
        if (qid) {
          const cur = await db.maybe<{ max_marks: number }>("select max_marks from assessment_questions where id = $1", [qid]);
          if (cur && q.maxMarks < cur.max_marks) {
            const over = await db.maybe("select 1 from student_marks where question_id = $1 and marks > $2 limit 1", [qid, q.maxMarks]);
            ensure(!over, `${a.name} ${q.label}: existing marks exceed the new maximum`);
          }
          await db.query("update assessment_questions set label=$2, max_marks=$3, sort_order=$4 where id=$1", [qid, q.label, q.maxMarks, qo]);
        } else {
          qid = (await db.one<{ id: string }>("insert into assessment_questions (offering_id, assessment_id, label, max_marks, sort_order) values ($1,$2,$3,$4,$5) returning id",
            [d.offeringId, aid, q.label, q.maxMarks, qo])).id;
        }
        await syncQuestionCos(db, d.offeringId, qid, q.coIds);
      }
    }
  }, "FACULTY");
}

/**
 * Temporarily renames only those rows whose unique code/name changes, so that
 * reordering (CO2 ↔ CO3) cannot collide with the unique constraint while
 * unchanged rows produce no audit noise.
 */
async function releaseCodes(db: Db, table: string, col: string, parentCol: string, parentId: string, desired: [string | undefined, string][]) {
  const current = await db.query<{ id: string; v: string }>(`select id, ${col} v from ${table} where ${parentCol} = $1`, [parentId]);
  const want = new Map(desired.filter(([id]) => id).map(([id, v]) => [id as string, v]));
  const changing = current.filter((r) => want.has(r.id) && want.get(r.id) !== r.v).map((r) => r.id);
  if (changing.length) await db.query(`update ${table} set ${col} = 'TMP-' || id::text where id = any($1)`, [changing]);
}

async function syncQuestionCos(db: Db, offeringId: string, questionId: string, coIds: string[]) {
  const cur = await db.query<{ co_id: string }>("select co_id from question_co_mappings where question_id = $1", [questionId]);
  for (const c of cur) if (!coIds.includes(c.co_id)) await db.query("delete from question_co_mappings where question_id = $1 and co_id = $2", [questionId, c.co_id]);
  for (const c of coIds) if (!cur.some((x) => x.co_id === c)) await db.query("insert into question_co_mappings (offering_id, question_id, co_id) values ($1,$2,$3)", [offeringId, questionId, c]);
}

export const questionMappingSchema = z.object({ offeringId: uuid, mapping: z.record(z.string().uuid(), z.array(z.string().uuid())) });
export async function saveQuestionMapping(actor: Actor, input: z.input<typeof questionMappingSchema>) {
  const d = parse(questionMappingSchema, input);
  return tx(actor, async (db) => {
    await assertEditable(db, d.offeringId);
    const settings = await loadSettings(db);
    const qs = new Set((await db.query<{ id: string }>("select id from assessment_questions where offering_id = $1", [d.offeringId])).map((r) => r.id));
    const cos = new Set((await db.query<{ id: string }>("select id from course_outcomes where offering_id = $1", [d.offeringId])).map((r) => r.id));
    for (const [qid, coIds] of Object.entries(d.mapping)) {
      ensure(qs.has(qid), "Unknown question");
      ensure(settings.allow_multi_co_questions || coIds.length <= 1, "The institution allows only one CO per question");
      for (const c of coIds) ensure(cos.has(c), "Unknown CO");
      await syncQuestionCos(db, d.offeringId, qid, coIds);
    }
  }, "FACULTY");
}

export interface AssessmentDetail {
  id: string; name: string; assessment_type: string; max_marks: number; weightage: number; assessment_date: string | null;
  questions: { id: string; label: string; max_marks: number; co_ids: string[]; marks_count: number }[];
}

export async function loadAssessments(db: Db, offeringId: string): Promise<AssessmentDetail[]> {
  return db.query<AssessmentDetail>(`
    select a.id, a.name, a.assessment_type, a.max_marks, a.weightage, a.assessment_date::text,
      coalesce((select json_agg(json_build_object('id', q.id, 'label', q.label, 'max_marks', q.max_marks,
         'co_ids', coalesce((select json_agg(m.co_id) from question_co_mappings m where m.question_id = q.id), '[]'),
         'marks_count', (select count(*) from student_marks sm where sm.question_id = q.id)) order by q.sort_order)
       from assessment_questions q where q.assessment_id = a.id), '[]') questions
    from assessments a where a.offering_id = $1 order by a.sort_order`, [offeringId]);
}

export function getAssessments(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => ({
    assessments: await loadAssessments(db, offeringId),
    cos: await db.query<{ id: string; code: string; description: string }>("select id, code, description from course_outcomes where offering_id = $1 order by sort_order", [offeringId]),
    allowMulti: (await loadSettings(db)).allow_multi_co_questions,
  }));
}

// ---------------------------------------------------------------------------
// Students / section configuration
// ---------------------------------------------------------------------------
export async function enrollBatch(actor: Actor, offeringId: string) {
  parse(uuid, offeringId);
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    const ctx = await loadOfferingContext(db, offeringId);
    const r = await db.query<{ id: string }>(`
      insert into enrollments (offering_id, student_id)
      select $1, s.id from students s where s.batch_id = $2 and upper(coalesce(s.section, '')) = upper($3) and s.is_active
        and (s.department_id = $4 or s.program_id = $5)
      on conflict (offering_id, student_id) do nothing returning id`,
      [offeringId, ctx.batch_id, ctx.section, ctx.department_id, ctx.program_id]);
    await logEvent(db, "STUDENTS_ENROLLED", "course_offerings", offeringId, offeringId, { added: r.length });
    return r.length;
  }, "FACULTY");
}

export async function enrollByRollNumbers(actor: Actor, offeringId: string, rollNos: string[]) {
  const rolls = [...new Set(rollNos.map((r) => r.trim().toUpperCase()).filter(Boolean))];
  ensure(rolls.length > 0, "Enter at least one roll number");
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    const found = await db.query<{ id: string; roll_no: string }>("select id, upper(roll_no) roll_no from students where upper(roll_no) = any($1)", [rolls]);
    const missing = rolls.filter((r) => !found.some((f) => f.roll_no === r));
    ensure(missing.length === 0, `Unknown roll numbers: ${missing.join(", ")}`);
    for (const s of found) await db.query("insert into enrollments (offering_id, student_id) values ($1,$2) on conflict (offering_id, student_id) do update set status = 'ENROLLED'", [offeringId, s.id]);
    return found.length;
  }, "FACULTY");
}

export async function withdrawStudent(actor: Actor, offeringId: string, studentId: string) {
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    await db.query("update enrollments set status = 'WITHDRAWN' where offering_id = $1 and student_id = $2", [offeringId, studentId]);
  }, "FACULTY");
}

export function getEnrollment(actor: Actor, offeringId: string) {
  return tx(actor, (db) => db.query<{ student_id: string; roll_no: string; full_name: string; section: string | null; status: string; marks_count: number }>(`
    select s.id student_id, s.roll_no, s.full_name, s.section, e.status,
      (select count(*)::int from student_marks sm where sm.student_id = s.id and sm.offering_id = e.offering_id) marks_count
    from enrollments e join students s on s.id = e.student_id where e.offering_id = $1 order by s.roll_no`, [offeringId]));
}
