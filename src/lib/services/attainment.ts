/**
 * Attainment pipeline: loads inputs under RLS, runs the pure engine, and
 * persists append-only calculation runs with full traceability.
 */
import type { Db } from "../db";
import { AppError } from "../errors";
import {
  aggregateProgramAttainment, classifyGap, computeDirectAttainment, computeFinalAttainment, computeIndirectAttainment,
  computeOutcomeContribution, ENGINE_VERSION, levelFor, resolveTarget, round2,
  type DirectCoResult, type FinalCoResult, type IndirectCoResult, type OutcomeContribution,
} from "../domain/attainment";
import { DEFAULT_METHODOLOGY, methodologySchema, type Methodology } from "../domain/methodology";
import { assertEditable, ensure, logEvent, tx, type Actor } from "./base";
import { loadCos, loadSettings } from "./workspace";

export interface ActiveMethodology { id: string | null; version: number; name: string; config: Methodology; scope: "INSTITUTION" | "PROGRAM" }

export async function loadMethodology(db: Db, programId: string | null): Promise<ActiveMethodology> {
  const rows = await db.query<{ id: string; version: number; name: string; config: unknown; program_id: string | null }>(
    "select id, version, name, config, program_id from attainment_methodologies where is_active and (program_id is null or program_id = $1) order by program_id nulls last",
    [programId],
  );
  const r = rows[0];
  if (!r) return { id: null, version: 0, name: "Built-in default", config: DEFAULT_METHODOLOGY, scope: "INSTITUTION" };
  const parsed = methodologySchema.safeParse({ ...DEFAULT_METHODOLOGY, ...(r.config as object) });
  if (!parsed.success) throw new AppError(`Active methodology v${r.version} is invalid: ${parsed.error.issues[0]?.message}`, "CONFIG");
  return { id: r.id, version: r.version, name: r.name, config: parsed.data, scope: r.program_id ? "PROGRAM" : "INSTITUTION" };
}

export async function loadAttainmentInputs(db: Db, offeringId: string) {
  const cos = await loadCos(db, offeringId);
  const assessments = await db.query<{ id: string; name: string; weightage: number }>("select id, name, weightage from assessments where offering_id = $1 order by sort_order", [offeringId]);
  const questions = await db.query<{ id: string; assessment_id: string; label: string; max_marks: number; co_ids: string[] }>(`
    select q.id, q.assessment_id, q.label, q.max_marks, coalesce(array_agg(m.co_id) filter (where m.co_id is not null), '{}') co_ids
    from assessment_questions q left join question_co_mappings m on m.question_id = q.id
    where q.offering_id = $1 group by q.id`, [offeringId]);
  // only marks of currently enrolled students
  const marks = await db.query<{ student_id: string; question_id: string; marks: number }>(`
    select sm.student_id, sm.question_id, sm.marks from student_marks sm
    join enrollments e on e.offering_id = sm.offering_id and e.student_id = sm.student_id and e.status = 'ENROLLED'
    where sm.offering_id = $1`, [offeringId]);
  const template = await db.maybe<{ id: string; scale_max: number }>("select id, scale_max from feedback_templates where offering_id = $1", [offeringId]);
  const fq = template ? await db.query<{ id: string; co_id: string }>("select id, co_id from feedback_questions where template_id = $1", [template.id]) : [];
  const responses = template ? await db.query<{ question_id: string; rating: number }>("select question_id, rating from feedback_responses where template_id = $1", [template.id]) : [];
  const submissions = template ? (await db.one<{ n: number }>("select count(*)::int n from feedback_submissions where template_id = $1", [template.id])).n : 0;
  const pos = await db.query<{ id: string; code: string }>(
    "select po.id, po.code from program_outcomes po join courses c on c.program_id = po.program_id join course_offerings o on o.course_id = c.id where o.id = $1 order by po.sort_order, po.code", [offeringId]);
  const psos = await db.query<{ id: string; code: string }>(
    "select x.id, x.code from program_specific_outcomes x join courses c on c.program_id = x.program_id join course_offerings o on o.course_id = c.id where o.id = $1 order by x.sort_order, x.code", [offeringId]);
  const poMap = await db.query<{ co_id: string; outcome_id: string; value: number }>("select co_id, po_id outcome_id, value from co_po_mappings where offering_id = $1", [offeringId]);
  const psoMap = await db.query<{ co_id: string; outcome_id: string; value: number }>("select co_id, pso_id outcome_id, value from co_pso_mappings where offering_id = $1", [offeringId]);
  return { cos, assessments, questions, marks, template, fq, responses, submissions, pos, psos, poMap, psoMap };
}

export interface CoursePipelineResult {
  methodology: ActiveMethodology;
  direct: DirectCoResult[];
  indirect: IndirectCoResult[];
  final: FinalCoResult[];
  po: OutcomeContribution[];
  pso: OutcomeContribution[];
}

/**
 * Calculates direct → indirect → final CO attainment → PO/PSO contribution →
 * gaps for one offering, and stores them as new current calculation runs.
 */
export async function calculateCourseAttainment(actor: Actor, offeringId: string): Promise<CoursePipelineResult> {
  return tx(actor, async (db) => {
    await assertEditable(db, offeringId);
    const prog = await db.one<{ program_id: string; academic_year_id: string }>(
      "select c.program_id, o.academic_year_id from course_offerings o join courses c on c.id = o.course_id where o.id = $1", [offeringId]);
    const methodology = await loadMethodology(db, prog.program_id);
    const m = methodology.config;
    const inp = await loadAttainmentInputs(db, offeringId);
    ensure(inp.cos.length > 0, "Define course outcomes before calculating attainment");
    ensure(inp.questions.length > 0, "Define the assessment structure before calculating attainment");
    ensure(inp.marks.length > 0, "Upload marks before calculating attainment");

    const cos = inp.cos.map((c) => ({ id: c.id, code: c.code, target: c.effective_target, targetSource: c.target_source }));
    const direct = computeDirectAttainment({
      cos,
      assessments: inp.assessments,
      questions: inp.questions.map((q) => ({ id: q.id, assessmentId: q.assessment_id, label: q.label, maxMarks: q.max_marks, coIds: q.co_ids })),
      marks: inp.marks.map((x) => ({ studentId: x.student_id, questionId: x.question_id, marks: x.marks })),
    }, m);
    const indirect = inp.template
      ? computeIndirectAttainment({ cos, questions: inp.fq.map((q) => ({ id: q.id, coId: q.co_id })), responses: inp.responses.map((r) => ({ questionId: r.question_id, rating: r.rating })), scaleMax: inp.template.scale_max }, m)
      : [];
    const final = computeFinalAttainment(cos, direct, indirect, m);
    const po = computeOutcomeContribution(final, inp.poMap.map((x) => ({ coId: x.co_id, outcomeId: x.outcome_id, value: x.value })), inp.pos, m);
    const pso = computeOutcomeContribution(final, inp.psoMap.map((x) => ({ coId: x.co_id, outcomeId: x.outcome_id, value: x.value })), inp.psos, m);

    const snapshot = JSON.stringify({ ...m, methodology_version: methodology.version, methodology_scope: methodology.scope });
    const summary = {
      cos: cos.length, questions: inp.questions.length, mark_records: inp.marks.length,
      students_with_marks: new Set(inp.marks.map((x) => x.student_id)).size,
      feedback_submissions: inp.submissions, feedback_ratings: inp.responses.length,
    };
    const newRun = async (type: string) =>
      (await db.one<{ id: string }>(
        `insert into calculation_runs (run_type, offering_id, program_id, academic_year_id, methodology_id, methodology_snapshot, inputs_summary, engine_version, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, clock_timestamp()) returning id`,
        [type, offeringId, prog.program_id, prog.academic_year_id, methodology.id, snapshot, JSON.stringify(summary), ENGINE_VERSION, actor.id])).id;

    for (const t of ["direct_attainment", "indirect_attainment", "course_attainment", "course_po_attainment", "course_pso_attainment", "gap_analysis"]) {
      await db.query(`update ${t} set is_current = false where offering_id = $1 and is_current`, [offeringId]);
    }

    const directRun = await newRun("DIRECT");
    for (const r of direct) {
      await db.query(
        `insert into direct_attainment (run_id, offering_id, co_id, students_assessed, students_meeting, average_score_pct, achievement_pct, attainment_level, threshold_pct, target_pct, target_source, gap, status, formula, inputs)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [directRun, offeringId, r.coId, r.studentsAssessed, r.studentsMeeting, r.averageScorePct, r.achievementPct, r.level, r.thresholdPct, r.targetPct, r.targetSource, r.gap, r.status, r.formula, JSON.stringify(r.inputs)]);
    }
    if (inp.template) {
      const indirectRun = await newRun("INDIRECT");
      for (const r of indirect) {
        await db.query(
          `insert into indirect_attainment (run_id, offering_id, co_id, respondents, mean_rating, scale_max, indirect_pct, formula, inputs) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [indirectRun, offeringId, r.coId, r.respondents, r.meanRating, r.scaleMax, r.indirectPct, r.formula, JSON.stringify(r.inputs)]);
      }
    }
    const courseRun = await newRun("COURSE");
    for (const r of final) {
      await db.query(
        `insert into course_attainment (run_id, offering_id, co_id, direct_pct, indirect_pct, direct_weight, indirect_weight, final_pct, attainment_level, target_pct, gap, status, formula, inputs)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [courseRun, offeringId, r.coId, r.directPct, r.indirectPct, r.directWeight, r.indirectWeight, r.finalPct, r.level, r.targetPct, r.gap, r.status, r.formula,
          JSON.stringify({ direct_run: directRun, target_source: cos.find((c) => c.id === r.coId)?.targetSource })]);
      await db.query(
        `insert into gap_analysis (run_id, level, offering_id, program_id, academic_year_id, entity_id, entity_code, target, actual, gap, classification) values ($1,'CO',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [courseRun, offeringId, prog.program_id, prog.academic_year_id, r.coId, r.coCode, r.targetPct, r.finalPct, r.gap, r.status]);
    }
    // course-level gap: mean of CO finals vs mean target
    const withFinal = final.filter((f) => f.finalPct !== null);
    if (withFinal.length === final.length && final.length > 0) {
      const actual = round2(withFinal.reduce((a, f) => a + f.finalPct!, 0) / withFinal.length);
      const target = round2(final.reduce((a, f) => a + f.targetPct, 0) / final.length);
      await db.query(
        `insert into gap_analysis (run_id, level, offering_id, program_id, academic_year_id, entity_id, entity_code, target, actual, gap, classification) values ($1,'COURSE',$2,$3,$4,$2,'COURSE',$5,$6,$7,$8)`,
        [courseRun, offeringId, prog.program_id, prog.academic_year_id, target, actual, round2(actual - target), classifyGap(round2(actual - target), m)]);
    }
    const poTargets = await db.query<{ id: string; target: number | null }>(
      "select po.id, po.target from program_outcomes po where po.program_id = $1 union all select x.id, x.target from program_specific_outcomes x where x.program_id = $1", [prog.program_id]);
    const progDefaults = await db.one<{ default_po_target: number | null }>("select default_po_target from programs where id = $1", [prog.program_id]);
    const settings = await loadSettings(db);
    const tgt = (id: string) => resolveTarget({ co: poTargets.find((t) => t.id === id)?.target, program: progDefaults.default_po_target, institution: settings.default_po_target }).target;
    for (const [kind, rows] of [["PO", po], ["PSO", pso]] as const) {
      for (const r of rows) {
        await db.query(
          `insert into ${kind === "PO" ? "course_po_attainment" : "course_pso_attainment"} (run_id, offering_id, ${kind === "PO" ? "po_id" : "pso_id"}, value_pct, attainment_level, mapping_sum, formula, inputs) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [courseRun, offeringId, r.outcomeId, r.valuePct, r.level, r.mappingSum, r.formula, JSON.stringify({ terms: r.terms })]);
        if (r.valuePct !== null) {
          const target = tgt(r.outcomeId);
          const gap = round2(r.valuePct - target);
          await db.query(
            `insert into gap_analysis (run_id, level, offering_id, program_id, academic_year_id, entity_id, entity_code, target, actual, gap, classification) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [courseRun, kind, offeringId, prog.program_id, prog.academic_year_id, r.outcomeId, r.outcomeCode, target, r.valuePct, gap, classifyGap(gap, m)]);
        }
      }
    }
    await logEvent(db, "ATTAINMENT_CALCULATED", "calculation_runs", courseRun, offeringId, { methodology_version: methodology.version, ...summary });
    return { methodology, direct, indirect, final, po, pso };
  }, "FACULTY");
}

export function getCourseAttainment(actor: Actor, offeringId: string) {
  return tx(actor, async (db) => {
    const run = await db.maybe<{ id: string; created_at: string; methodology_snapshot: Methodology & { methodology_version: number }; inputs_summary: Record<string, number>; engine_version: string; created_by_name: string; stale: boolean }>(`
      select r.id, r.created_at::text, r.methodology_snapshot, r.inputs_summary, r.engine_version, u.full_name created_by_name,
        r.created_at < o.calc_inputs_changed_at stale
      from calculation_runs r join course_offerings o on o.id = r.offering_id left join users u on u.id = r.created_by
      where r.offering_id = $1 and r.run_type = 'COURSE' order by r.created_at desc limit 1`, [offeringId]);
    const direct = await db.query<{ co_id: string; co_code: string; description: string; students_assessed: number; students_meeting: number; average_score_pct: number | null; achievement_pct: number | null; attainment_level: number | null; threshold_pct: number; target_pct: number; target_source: string; gap: number | null; status: string; formula: string; inputs: DirectCoResult["inputs"] }>(`
      select d.co_id, co.code co_code, co.description, d.students_assessed, d.students_meeting, d.average_score_pct, d.achievement_pct, d.attainment_level,
        d.threshold_pct, d.target_pct, d.target_source, d.gap, d.status, d.formula, d.inputs
      from direct_attainment d join course_outcomes co on co.id = d.co_id where d.offering_id = $1 and d.is_current order by co.sort_order`, [offeringId]);
    const indirect = await db.query<{ co_id: string; co_code: string; respondents: number; mean_rating: number | null; scale_max: number; indirect_pct: number | null; formula: string; inputs: IndirectCoResult["inputs"] }>(`
      select i.co_id, co.code co_code, i.respondents, i.mean_rating, i.scale_max, i.indirect_pct, i.formula, i.inputs
      from indirect_attainment i join course_outcomes co on co.id = i.co_id where i.offering_id = $1 and i.is_current order by co.sort_order`, [offeringId]);
    const final = await db.query<{ co_id: string; co_code: string; description: string; direct_pct: number | null; indirect_pct: number | null; direct_weight: number; indirect_weight: number; final_pct: number | null; attainment_level: number | null; target_pct: number; gap: number | null; status: string; formula: string }>(`
      select ca.co_id, co.code co_code, co.description, ca.direct_pct, ca.indirect_pct, ca.direct_weight, ca.indirect_weight, ca.final_pct,
        ca.attainment_level, ca.target_pct, ca.gap, ca.status, ca.formula
      from course_attainment ca join course_outcomes co on co.id = ca.co_id where ca.offering_id = $1 and ca.is_current order by co.sort_order`, [offeringId]);
    const po = await db.query<{ code: string; title: string; value_pct: number | null; attainment_level: number | null; mapping_sum: number; formula: string }>(`
      select po.code, po.title, x.value_pct, x.attainment_level, x.mapping_sum, x.formula from course_po_attainment x join program_outcomes po on po.id = x.po_id
      where x.offering_id = $1 and x.is_current order by po.sort_order, po.code`, [offeringId]);
    const pso = await db.query<{ code: string; title: string; value_pct: number | null; attainment_level: number | null; mapping_sum: number; formula: string }>(`
      select p.code, p.title, x.value_pct, x.attainment_level, x.mapping_sum, x.formula from course_pso_attainment x join program_specific_outcomes p on p.id = x.pso_id
      where x.offering_id = $1 and x.is_current order by p.sort_order, p.code`, [offeringId]);
    const gaps = await db.query<{ id: string; level: string; entity_code: string; target: number; actual: number | null; gap: number | null; classification: string }>(`
      select id, level, entity_code, target, actual, gap, classification from gap_analysis where offering_id = $1 and is_current
      order by case level when 'CO' then 1 when 'COURSE' then 2 when 'PO' then 3 else 4 end, entity_code`, [offeringId]);
    const history = await db.query<{ id: string; created_at: string; created_by_name: string; methodology_version: number }>(`
      select r.id, r.created_at::text, u.full_name created_by_name, (r.methodology_snapshot->>'methodology_version')::int methodology_version
      from calculation_runs r left join users u on u.id = r.created_by where r.offering_id = $1 and r.run_type = 'COURSE' order by r.created_at desc limit 10`, [offeringId]);
    return { run, direct, indirect, final, po, pso, gaps, history };
  });
}

// ---------------------------------------------------------------------------
// Program attainment
// ---------------------------------------------------------------------------
export async function calculateProgramAttainment(actor: Actor, programId: string, academicYearId: string) {
  return tx(actor, async (db) => {
    const allowed = await db.one<{ ok: boolean }>("select (app.can_manage_program($1) or app.is_iqac()) ok", [programId]);
    ensure(allowed.ok, "Only the Program Coordinator, HOD or IQAC can calculate program attainment", "FORBIDDEN");
    const methodology = await loadMethodology(db, programId);
    const m = methodology.config;
    const settings = await loadSettings(db);
    const program = await db.one<{ default_po_target: number | null }>("select default_po_target from programs where id = $1", [programId]);

    const offerings = await db.query<{ id: string; code: string; credits: number; status: string }>(`
      select o.id, c.code, c.credits, o.status from course_offerings o join courses c on c.id = o.course_id
      where c.program_id = $1 and o.academic_year_id = $2
        and exists (select 1 from course_attainment ca where ca.offering_id = o.id and ca.is_current and ca.final_pct is not null)
      order by c.code`, [programId, academicYearId]);
    ensure(offerings.length > 0, "No course in this program/year has final course attainment yet");

    const build = async (kind: "PO" | "PSO") => {
      const outTable = kind === "PO" ? "program_outcomes" : "program_specific_outcomes";
      const attTable = kind === "PO" ? "course_po_attainment" : "course_pso_attainment";
      const col = kind === "PO" ? "po_id" : "pso_id";
      const outcomes = await db.query<{ id: string; code: string; target: number | null }>(`select id, code, target from ${outTable} where program_id = $1 order by sort_order, code`, [programId]);
      const values = await db.query<{ offering_id: string; outcome_id: string; value_pct: number | null; mapping_sum: number }>(
        `select offering_id, ${col} outcome_id, value_pct, mapping_sum from ${attTable} where is_current and offering_id = any($1)`, [offerings.map((o) => o.id)]);
      const courses = offerings.map((o) => ({
        offeringId: o.id, courseCode: o.code, credits: o.credits, locked: o.status === "LOCKED",
        values: Object.fromEntries(values.filter((v) => v.offering_id === o.id).map((v) => [v.outcome_id, { valuePct: v.value_pct, mappingSum: v.mapping_sum }])),
      }));
      return aggregateProgramAttainment(
        courses,
        outcomes.map((o) => ({ id: o.id, code: o.code, target: resolveTarget({ co: o.target, program: program.default_po_target, institution: settings.default_po_target }).target })),
        m,
      );
    };
    const po = await build("PO");
    const pso = await build("PSO");
    const included = new Set([...po, ...pso].flatMap((r) => r.contributing.map((c) => c.offeringId)));
    const provisional = offerings.some((o) => included.has(o.id) && o.status !== "LOCKED");

    const run = (await db.one<{ id: string }>(
      `insert into calculation_runs (run_type, program_id, academic_year_id, methodology_id, methodology_snapshot, inputs_summary, engine_version, created_by, created_at)
       values ('PROGRAM',$1,$2,$3,$4,$5,$6,$7, clock_timestamp()) returning id`,
      [programId, academicYearId, methodology.id, JSON.stringify({ ...m, methodology_version: methodology.version }),
        JSON.stringify({ offerings: offerings.map((o) => ({ code: o.code, status: o.status })) }), ENGINE_VERSION, actor.id])).id;
    for (const t of ["program_attainment", "po_attainment", "pso_attainment"]) {
      await db.query(`update ${t} set is_current = false where program_id = $1 and academic_year_id = $2 and is_current`, [programId, academicYearId]);
    }
    await db.query("update gap_analysis set is_current = false where program_id = $1 and academic_year_id = $2 and offering_id is null and is_current", [programId, academicYearId]);
    await db.query(
      "insert into program_attainment (run_id, program_id, academic_year_id, aggregation_method, courses_included, provisional, summary) values ($1,$2,$3,$4,$5,$6,$7)",
      [run, programId, academicYearId, m.program_aggregation, included.size, provisional,
        JSON.stringify({ po_mean: mean(po.map((p) => p.valuePct)), pso_mean: mean(pso.map((p) => p.valuePct)), scope: m.program_scope })]);
    for (const [kind, rows] of [["PO", po], ["PSO", pso]] as const) {
      for (const r of rows) {
        await db.query(
          `insert into ${kind === "PO" ? "po_attainment" : "pso_attainment"} (run_id, program_id, academic_year_id, ${kind === "PO" ? "po_id" : "pso_id"}, value_pct, attainment_level, target_pct, gap, status, contributing, formula)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [run, programId, academicYearId, r.outcomeId, r.valuePct, r.level, r.targetPct, r.gap, r.status, JSON.stringify(r.contributing), r.formula]);
        await db.query(
          `insert into gap_analysis (run_id, level, program_id, academic_year_id, entity_id, entity_code, target, actual, gap, classification) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [run, kind, programId, academicYearId, r.outcomeId, r.outcomeCode, r.targetPct, r.valuePct, r.gap, r.status]);
      }
    }
    await logEvent(db, "PROGRAM_ATTAINMENT_CALCULATED", "calculation_runs", run, null, { programId, academicYearId, courses: included.size, provisional });
    return { po, pso, provisional, coursesIncluded: included.size, methodology };
  }, "PROGRAM_COORDINATOR");
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

export function getProgramAttainment(actor: Actor, programId: string, academicYearId: string) {
  return tx(actor, async (db) => {
    const summary = await db.maybe<{ run_id: string; aggregation_method: string; courses_included: number; provisional: boolean; summary: Record<string, unknown>; created_at: string }>(
      "select run_id, aggregation_method, courses_included, provisional, summary, created_at::text from program_attainment where program_id = $1 and academic_year_id = $2 and is_current", [programId, academicYearId]);
    const q = (kind: "PO" | "PSO") => db.query<{ code: string; title: string; value_pct: number | null; attainment_level: number | null; target_pct: number; gap: number | null; status: string; contributing: { courseCode: string; valuePct: number; weight: number; locked: boolean }[]; formula: string }>(`
      select o.code, o.title, a.value_pct, a.attainment_level, a.target_pct, a.gap, a.status, a.contributing, a.formula
      from ${kind === "PO" ? "po_attainment" : "pso_attainment"} a join ${kind === "PO" ? "program_outcomes" : "program_specific_outcomes"} o on o.id = a.${kind === "PO" ? "po_id" : "pso_id"}
      where a.program_id = $1 and a.academic_year_id = $2 and a.is_current order by o.sort_order, o.code`, [programId, academicYearId]);
    const matrix = await db.query<{ course_code: string; po_code: string; value_pct: number | null }>(`
      select c.code course_code, po.code po_code, x.value_pct from course_po_attainment x
      join course_offerings o on o.id = x.offering_id join courses c on c.id = o.course_id join program_outcomes po on po.id = x.po_id
      where c.program_id = $1 and o.academic_year_id = $2 and x.is_current order by c.code, po.sort_order`, [programId, academicYearId]);
    return { summary, po: await q("PO"), pso: await q("PSO"), matrix };
  });
}

export { levelFor };
