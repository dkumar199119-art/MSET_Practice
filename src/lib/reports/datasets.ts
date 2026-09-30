/** Report datasets. All reads run under the requesting user's RLS scope. */
import { AppError } from "../errors";
import { BLOOM_LABELS, type BloomLevel } from "../domain/bloom";
import { tx, type Actor } from "../services/base";
import { getCourseAttainment, getProgramAttainment } from "../services/attainment";
import { getMatrix, getWorkspace, loadAssessments } from "../services/workspace";
import type { ReportDataset, ReportFormat } from "./render";

export const REPORT_TYPES = {
  COURSE_ATTAINMENT: "Course Attainment Report",
  COURSE_PO_PSO: "Course PO/PSO Attainment Report",
  COURSE_GAP: "Course Gap Analysis Report",
  PROGRAM_ATTAINMENT: "Program Attainment Report",
  PROGRAM_GAP: "Program Gap Analysis Report",
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v.toFixed(2)}%`);
const signed = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
const human = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

async function courseHeader(actor: Actor, offeringId: string) {
  const w = await getWorkspace(actor, offeringId);
  const c = w.ctx;
  const meta: [string, string][] = [
    ["Course", `${c.course_code} ${c.course_name}`],
    ["Program", `${c.program_code} ${c.program_name}`],
    ["Department", c.department_name],
    ["Academic Year", c.academic_year],
    ["Semester", c.semester],
    ["Batch / Section", `${c.batch} / ${c.section}`],
    ["Credits (L-T-P)", `${c.credits} (${c.lecture_hours}-${c.tutorial_hours}-${c.practical_hours})`],
    ["Faculty", c.faculty.map((f) => f.full_name).join(", ") || "—"],
    ["Status", `${c.status} · Version ${c.version}`],
  ];
  return { w, meta };
}

export async function buildCourseReport(actor: Actor, offeringId: string, type: "COURSE_ATTAINMENT" | "COURSE_PO_PSO" | "COURSE_GAP", generatedBy: string): Promise<ReportDataset> {
  const { w, meta } = await courseHeader(actor, offeringId);
  const att = await getCourseAttainment(actor, offeringId);
  if (!att.run) throw new AppError("Attainment has not been calculated for this course yet", "VALIDATION");
  const m = att.run.methodology_snapshot;
  meta.push(["Methodology", `v${m.methodology_version} · Direct ${m.direct_weight}% / Indirect ${m.indirect_weight}% · threshold ${m.student_threshold_pct}%`]);
  meta.push(["Calculated", `${att.run.created_at.slice(0, 16)} by ${att.run.created_by_name} (engine ${att.run.engine_version})`]);
  const sections: ReportDataset["sections"] = [];

  if (type === "COURSE_ATTAINMENT") {
    const cos = await tx(actor, (db) => db.query<{ code: string; description: string; bloom_level: string | null }>("select code, description, bloom_level from course_outcomes where offering_id = $1 order by sort_order", [offeringId]));
    sections.push({ heading: "Course Outcomes", columns: ["CO", "Statement", "Bloom Level"], rows: cos.map((c) => [c.code, c.description, c.bloom_level ? BLOOM_LABELS[c.bloom_level as BloomLevel] : null]) });
    for (const kind of ["PO", "PSO"] as const) {
      const mx = await getMatrix(actor, offeringId, kind);
      if (!mx.outcomes.length) continue;
      sections.push({
        heading: `CO-${kind} Articulation Matrix`,
        columns: ["CO", ...mx.outcomes.map((o) => o.code)],
        rows: mx.cos.map((c) => [c.code, ...mx.outcomes.map((o) => mx.cells.find((x) => x.co_id === c.id && x.outcome_id === o.id)?.value || "-")]),
        note: `Scale 0–${mx.scaleMax}. CO coverage ${mx.coverage.coCoverage}%, ${kind} coverage ${mx.coverage.outcomeCoverage}%.`,
      });
    }
    const assessments = await tx(actor, (db) => loadAssessments(db, offeringId));
    const coById = await tx(actor, (db) => db.query<{ id: string; code: string }>("select id, code from course_outcomes where offering_id = $1", [offeringId]));
    sections.push({
      heading: "Assessment Mapping",
      columns: ["Assessment", "Type", "Max Marks", "Weightage", "Question", "Q Max", "Mapped COs"],
      rows: assessments.flatMap((a) => a.questions.map((q) => [a.name, human(a.assessment_type), a.max_marks, `${a.weightage}%`, q.label, q.max_marks, q.co_ids.map((id) => coById.find((c) => c.id === id)?.code).join(", ")])),
    });
    sections.push({
      heading: "Direct Attainment",
      columns: ["CO", "Target", "Students Assessed", "Meeting Threshold", "Achievement", "Level", "Gap", "Status"],
      rows: att.direct.map((d) => [d.co_code, pct(d.target_pct), d.students_assessed, d.students_meeting, pct(d.achievement_pct), d.attainment_level, signed(d.gap), human(d.status)]),
      note: att.direct.map((d) => `${d.co_code}: ${d.formula}`).join("\n"),
    });
    sections.push({
      heading: "Indirect Attainment (Course Feedback)",
      columns: ["CO", "Respondents", "Mean Rating", "Scale", "Indirect %"],
      rows: att.indirect.map((i) => [i.co_code, i.respondents, i.mean_rating, i.scale_max, pct(i.indirect_pct)]),
    });
    sections.push({
      heading: "Final Course Attainment",
      columns: ["CO", "Direct", "Indirect", "Weights (D/I)", "Final", "Level", "Target", "Gap", "Status"],
      rows: att.final.map((f) => [f.co_code, pct(f.direct_pct), pct(f.indirect_pct), `${f.direct_weight}/${f.indirect_weight}`, pct(f.final_pct), f.attainment_level, pct(f.target_pct), signed(f.gap), human(f.status)]),
      note: att.final.map((f) => `${f.co_code}: ${f.formula}`).join("\n"),
    });
  }

  if (type === "COURSE_ATTAINMENT" || type === "COURSE_PO_PSO") {
    sections.push({
      heading: "PO Attainment (course contribution)",
      columns: ["PO", "Title", "Attainment", "Level", "Σ Correlation", "Formula"],
      rows: att.po.map((p) => [p.code, p.title, pct(p.value_pct), p.attainment_level, p.mapping_sum, p.formula]),
    });
    if (att.pso.length) {
      sections.push({
        heading: "PSO Attainment (course contribution)",
        columns: ["PSO", "Title", "Attainment", "Level", "Σ Correlation", "Formula"],
        rows: att.pso.map((p) => [p.code, p.title, pct(p.value_pct), p.attainment_level, p.mapping_sum, p.formula]),
      });
    }
  }

  if (type === "COURSE_ATTAINMENT" || type === "COURSE_GAP") {
    sections.push({
      heading: "Gap Analysis",
      columns: ["Level", "Entity", "Target", "Actual", "Gap", "Classification"],
      rows: att.gaps.map((g) => [g.level, g.entity_code, pct(g.target), pct(g.actual), signed(g.gap), human(g.classification)]),
    });
    const plans = await tx(actor, (db) => db.query<{ level: string; entity_code: string; root_cause: string; corrective_action: string; target_date: string | null; status: string }>(
      "select level, entity_code, root_cause, corrective_action, target_date::text, status from action_plans where offering_id = $1 order by created_at", [offeringId]));
    sections.push({
      heading: "Action Plans",
      columns: ["Level", "Entity", "Root Cause", "Corrective Action", "Target Date", "Status"],
      rows: plans.map((p) => [p.level, p.entity_code, p.root_cause, p.corrective_action, p.target_date, human(p.status)]),
    });
  }

  return {
    title: REPORT_TYPES[type],
    subtitle: `${w.ctx.course_code} ${w.ctx.course_name} — ${w.ctx.academic_year}, ${w.ctx.semester}`,
    meta,
    sections,
    generatedBy,
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
}

export async function buildProgramReport(actor: Actor, programId: string, academicYearId: string, type: "PROGRAM_ATTAINMENT" | "PROGRAM_GAP", generatedBy: string): Promise<ReportDataset> {
  const info = await tx(actor, (db) => db.maybe<{ code: string; name: string; department: string; ay: string }>(
    "select p.code, p.name, d.name department, (select name from academic_years where id = $2) ay from programs p join departments d on d.id = p.department_id where p.id = $1", [programId, academicYearId]));
  if (!info) throw new AppError("Program not found or not accessible", "NOT_FOUND");
  const pa = await getProgramAttainment(actor, programId, academicYearId);
  if (!pa.summary) throw new AppError("Program attainment has not been calculated for this academic year", "VALIDATION");
  const meta: [string, string][] = [
    ["Program", `${info.code} ${info.name}`],
    ["Department", info.department],
    ["Academic Year", info.ay ?? ""],
    ["Aggregation", human(pa.summary.aggregation_method)],
    ["Courses included", String(pa.summary.courses_included)],
    ["Status", pa.summary.provisional ? "Provisional (includes courses not yet approved)" : "Final (approved courses only)"],
    ["Calculated", pa.summary.created_at.slice(0, 16)],
  ];
  const sections: ReportDataset["sections"] = [];
  for (const [kind, rows] of [["PO", pa.po], ["PSO", pa.pso]] as const) {
    if (!rows.length) continue;
    if (type === "PROGRAM_ATTAINMENT") {
      sections.push({
        heading: `${kind} Attainment`,
        columns: [kind, "Title", "Attainment", "Level", "Target", "Gap", "Status", "Contributing Courses"],
        rows: rows.map((r) => [r.code, r.title, pct(r.value_pct), r.attainment_level, pct(r.target_pct), signed(r.gap), human(r.status), r.contributing.map((c) => `${c.courseCode} (${c.valuePct}%${c.locked ? "" : ", provisional"})`).join("; ")]),
        note: rows.map((r) => r.formula).join("\n"),
      });
    } else {
      sections.push({
        heading: `${kind} Gap Analysis`,
        columns: [kind, "Target", "Actual", "Gap", "Classification"],
        rows: rows.map((r) => [r.code, pct(r.target_pct), pct(r.value_pct), signed(r.gap), human(r.status)]),
      });
    }
  }
  if (type === "PROGRAM_ATTAINMENT" && pa.matrix.length) {
    const courses = [...new Set(pa.matrix.map((x) => x.course_code))];
    const pos = [...new Set(pa.matrix.map((x) => x.po_code))];
    sections.push({
      heading: "Course × PO Contribution Matrix",
      columns: ["Course", ...pos],
      rows: courses.map((c) => [c, ...pos.map((p) => { const v = pa.matrix.find((x) => x.course_code === c && x.po_code === p)?.value_pct; return v === null || v === undefined ? "-" : v.toFixed(1); })]),
    });
  }
  return { title: REPORT_TYPES[type], subtitle: `${info.code} ${info.name} — ${info.ay}`, meta, sections, generatedBy, generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") };
}

export async function recordReport(actor: Actor, type: ReportType, format: ReportFormat, scope: Record<string, string>, fileName: string) {
  await tx(actor, (db) => db.query("insert into reports (report_type, format, scope, file_name, generated_by) values ($1,$2,$3,$4,$5)", [type, format, JSON.stringify(scope), fileName, actor.id]));
}
