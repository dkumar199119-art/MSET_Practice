/**
 * End-to-end MVP lifecycle against a real PostgreSQL database with RLS
 * (spec §53 / §60). Every step runs as the responsible role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDb, sql, sqlAs } from "./helpers";
import { actor, buildMarksRows, facultyCourseSetup, setupProgramAndAllocation, studentsSubmitFeedback } from "./scenario";
import { closePool } from "../../src/lib/db";
import * as ws from "../../src/lib/services/workspace";
import * as marks from "../../src/lib/services/marks";
import * as feedback from "../../src/lib/services/feedback";
import * as attainment from "../../src/lib/services/attainment";
import * as workflow from "../../src/lib/services/workflow";
import * as ai from "../../src/lib/services/ai";
import * as ap from "../../src/lib/services/action-plans";
import * as evidence from "../../src/lib/services/evidence";
import * as dash from "../../src/lib/services/dashboards";
import { buildCourseReport, buildProgramReport } from "../../src/lib/reports/datasets";
import { render } from "../../src/lib/reports/render";
import { setGeminiTransport } from "../../src/lib/ai/gemini";
import { computeDirectAttainment } from "../../src/lib/domain/attainment";
import { DEFAULT_METHODOLOGY } from "../../src/lib/domain/methodology";

let ids: Awaited<ReturnType<typeof setupProgramAndAllocation>>;

beforeAll(async () => {
  await resetTestDb(60);
  ids = await setupProgramAndAllocation();
});
afterAll(async () => {
  setGeminiTransport(null);
  await closePool();
});

describe("MVP course lifecycle", () => {
  it("1-6: HOD → Program → PC → Course → CC → Faculty allocation; course appears in My Assigned Courses at 0%", async () => {
    const fa = await actor("faculty.a@obe.local");
    const mine = await ws.listMyCourses(fa);
    expect(mine).toHaveLength(1);
    expect(mine[0].course_code).toBe("ME301");
    expect(mine[0].completion.percent).toBe(0);
    const notes = await sql<{ title: string }>("select n.title from notifications n join users u on u.id = n.user_id where u.email = 'faculty.a@obe.local'");
    expect(notes.map((n) => n.title)).toContain("New Course Assigned");
    const pos = await sql("select code from program_outcomes where program_id = $1", [ids.programId]);
    expect(pos).toHaveLength(12);
  });

  it("7-15: faculty completes the course setup wizard", async () => {
    const { enrolled } = await facultyCourseSetup(ids.offeringId);
    expect(enrolled).toBe(60);
    const fa = await actor("faculty.a@obe.local");
    const w = await ws.getWorkspace(fa, ids.offeringId);
    for (const k of ["profile", "syllabus", "objectives", "cos", "bloom", "targets", "co_po", "co_pso", "assessments", "question_mapping", "students"] as const) {
      expect(w.progress[k], k).toBe(true);
    }
    expect(w.progress.marks).toBe(false);
    expect(w.completion.percent).toBe(70);
    const mx = await ws.getMatrix(fa, ids.offeringId, "PO");
    expect(mx.coverage.coCoverage).toBe(100);
    expect(mx.coverage.unmappedOutcomes).toContain("PO12");
    const o = await ws.getOutcomes(fa, ids.offeringId);
    expect(o.cos.every((c) => c.check.measurable)).toBe(true);
    expect(o.cos.find((c) => c.code === "CO3")?.effective_target).toBe(65);
    expect(o.cos.find((c) => c.code === "CO1")?.target_source).toBe("COURSE");
  });

  it("16: marks upload rejects invalid records and saves valid ones", async () => {
    const fa = await actor("faculty.a@obe.local");
    const rows = await buildMarksRows(ids.offeringId);
    expect(rows).toHaveLength(600);
    const bad = [
      ...rows.slice(0, 5),
      { rowNumber: 900, values: { studentId: "ME23001", assessment: "Mid Term", question: "Q1", marks: 11 } },
      { rowNumber: 901, values: { studentId: "XX999", assessment: "Mid Term", question: "Q1", marks: 3 } },
      { rowNumber: 902, values: { studentId: "ME23002", assessment: "Quiz", question: "Q1", marks: 3 } },
    ];
    const v = await marks.validateMarks(fa, { offeringId: ids.offeringId, fileName: "bad.xlsx", rows: bad });
    expect(v.errors.map((e) => e.row).sort()).toEqual([900, 901, 902]);
    await expect(marks.saveMarks(fa, { offeringId: ids.offeringId, fileName: "bad.xlsx", rows: bad })).rejects.toThrow(/error/);
    expect((await sql("select count(*)::int n from student_marks"))[0]).toEqual({ n: 0 });
    const ok = await marks.saveMarks(fa, { offeringId: ids.offeringId, fileName: "ME301_marks.xlsx", rows });
    expect(ok.saved).toBe(600);
  });

  it("17: direct attainment is calculated and matches an independent recomputation", async () => {
    const fa = await actor("faculty.a@obe.local");
    const res = await attainment.calculateCourseAttainment(fa, ids.offeringId);
    expect(res.direct).toHaveLength(5);
    // independent check for CO1 straight from the database
    const co1 = (await sql<{ id: string }>("select id from course_outcomes where offering_id = $1 and code = 'CO1'", [ids.offeringId]))[0].id;
    const perStudent = await sql<{ pct: number }>(`
      select sum(sm.marks)::float / sum(q.max_marks)::float * 100 pct from student_marks sm
      join assessment_questions q on q.id = sm.question_id join question_co_mappings m on m.question_id = q.id
      where m.co_id = $1 group by sm.student_id`, [co1]);
    const meeting = perStudent.filter((p) => p.pct >= 60 - 1e-9).length;
    const d1 = res.direct.find((d) => d.coCode === "CO1")!;
    expect(d1.studentsAssessed).toBe(60);
    expect(d1.studentsMeeting).toBe(meeting);
    expect(d1.achievementPct).toBeCloseTo((meeting / 60) * 100, 2);
    // without feedback the final attainment is incomplete
    expect(res.final.every((f) => f.status === "INCOMPLETE")).toBe(true);
    const w = await ws.getWorkspace(fa, ids.offeringId);
    expect(w.progress.direct).toBe(true);
    expect(w.progress.final).toBe(false);
    void computeDirectAttainment; void DEFAULT_METHODOLOGY;
  });

  it("18-20: students submit feedback once; indirect and final attainment are calculated", async () => {
    const fa = await actor("faculty.a@obe.local");
    await feedback.publishFeedback(fa, ids.offeringId);
    const n = await studentsSubmitFeedback(ids.offeringId, 45);
    expect(n).toBe(45);
    // duplicate submission prevented
    const st = await actor("me23001@students.obe.local");
    const form = await feedback.getStudentFeedbackForm(st, ids.offeringId);
    expect(form.submitted).toBe(true);
    await expect(feedback.submitFeedback(st, { templateId: form.template.id, ratings: Object.fromEntries(form.questions.map((q) => [q.id, 5])) })).rejects.toThrow(/already submitted/i);
    // non-enrolled user (another staff member) cannot submit
    const fb = await actor("faculty.b@obe.local");
    await expect(feedback.submitFeedback(fb, { templateId: form.template.id, ratings: {} })).rejects.toThrow(/Only students/);
    // responses are anonymous: no student reference in responses
    const cols = await sql<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'feedback_responses'");
    expect(cols.map((c) => c.column_name)).not.toContain("student_id");

    const res = await attainment.calculateCourseAttainment(fa, ids.offeringId);
    for (const f of res.final) {
      expect(f.finalPct).not.toBeNull();
      expect(f.finalPct!).toBeCloseTo(f.directPct! * 0.8 + f.indirectPct! * 0.2, 1);
      expect(f.formula).toContain("× 0.80");
    }
    expect(res.indirect.every((i) => i.respondents === 45)).toBe(true);
    const po1 = res.po.find((p) => p.outcomeCode === "PO1")!;
    const expected = res.final.reduce((a, f, i) => a + f.finalPct! * [3, 3, 2, 3, 2][i], 0) / 13;
    expect(po1.valuePct!).toBeCloseTo(expected, 1);
    expect(res.po.find((p) => p.outcomeCode === "PO12")!.valuePct).toBeNull();
  });

  it("21-23: PO/PSO contribution, gap analysis, AI analysis (mocked Gemini, aggregated data only), action plans, evidence", async () => {
    const fa = await actor("faculty.a@obe.local");
    const att = await attainment.getCourseAttainment(fa, ids.offeringId);
    expect(att.po.length).toBe(12);
    expect(att.pso.length).toBe(2);
    expect(att.gaps.some((g) => g.level === "CO")).toBe(true);
    expect(att.gaps.some((g) => g.level === "PO")).toBe(true);

    let promptSeen = "";
    setGeminiTransport(async (req) => {
      promptSeen = req.prompt;
      return {
        model: "mock-gemini",
        latencyMs: 5,
        text: JSON.stringify({
          patterns: ["CO5 performance is lowest"], possible_reasons: ["Limited problem practice on impulse-momentum"],
          teaching_interventions: ["Add tutorial sessions"], assessment_improvements: ["Add quiz on CO5"], remedial_activities: ["Remedial classes"],
          monitoring_plan: ["Track CO5 in next mid-term"],
          corrective_actions: [{ level: "CO", entity_code: "CO5", root_cause: "Insufficient practice on energy methods", corrective_action: "Weekly problem-solving tutorials for CO5" }],
        }),
      };
    });
    const r = await ai.runAiFeature(fa, ids.offeringId, "GAP_ANALYSIS");
    expect(r.label).toMatch(/requires academic review/);
    expect(r.output.corrective_actions[0].entity_code).toBe("CO5");
    // no student PII in the prompt
    expect(promptSeen).not.toMatch(/ME23\d{3}/);
    const studentName = (await sql<{ full_name: string }>("select full_name from students limit 1"))[0].full_name;
    expect(promptSeen).not.toContain(studentName);
    const logged = await sql<{ status: string; feature: string }>("select status, feature from ai_interactions");
    expect(logged).toEqual([{ status: "SUCCESS", feature: "GAP_ANALYSIS" }]);
    await ai.decideSuggestion(fa, { suggestionId: r.suggestionId, status: "ACCEPTED" });

    // action plan for every gap below target
    const gaps = att.gaps.filter((g) => ["BELOW_TARGET", "CRITICAL"].includes(g.classification));
    for (const g of gaps) {
      await ap.createActionPlan(fa, { offeringId: ids.offeringId, gapId: g.id, level: g.level as "CO", entityCode: g.entity_code, rootCause: "Insufficient practice with problem solving", correctiveAction: "Additional tutorials and targeted assignments next offering" });
    }
    await evidence.uploadEvidence(fa, { offeringId: ids.offeringId, evidenceType: "QUESTION_PAPER", title: "Mid Term question paper" }, { name: "midterm.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4 test") });
    const w = await ws.getWorkspace(fa, ids.offeringId);
    expect(w.completion.percent).toBe(100);
    expect(w.progress.action_plans).toBe(true);
    expect(w.progress.evidence).toBe(true);
  });

  it("24-30: submission → CC → PC (return + resubmit) → HOD → APPROVED/LOCKED; locked data is immutable", async () => {
    const fa = await actor("faculty.a@obe.local");
    const cc = await actor("cc.me@obe.local");
    const pc = await actor("pc.me@obe.local");
    const hod = await actor("hod.me@obe.local");

    // PC cannot approve before the CC stage
    expect(await workflow.submitForReview(fa, ids.offeringId)).toBe("SUBMITTED");
    await expect(workflow.reviewOffering(pc, { offeringId: ids.offeringId, decision: "APPROVE" })).rejects.toThrow(/not the reviewer/);
    // submitted data is locked
    const co = (await sql<{ id: string }>("select id from course_outcomes where offering_id = $1 limit 1", [ids.offeringId]))[0].id;
    await expect(sqlAs(fa.id, "update course_outcomes set description = 'hacked' where id = $1", [co])).rejects.toThrow(/locked/);
    await expect(ws.saveObjectives(fa, { offeringId: ids.offeringId, items: [] })).rejects.toThrow(/locked/);

    expect(await workflow.reviewOffering(cc, { offeringId: ids.offeringId, decision: "APPROVE", comment: "CO statements fine" })).toBe("UNDER_REVIEW");
    await expect(workflow.reviewOffering(pc, { offeringId: ids.offeringId, decision: "RETURN", comment: "" })).rejects.toThrow(/comment/i);
    expect(await workflow.reviewOffering(pc, { offeringId: ids.offeringId, decision: "RETURN", comment: "Please attach the end-semester question paper" })).toBe("RETURNED");
    await evidence.uploadEvidence(fa, { offeringId: ids.offeringId, evidenceType: "QUESTION_PAPER", title: "End semester question paper" }, { name: "endsem.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4 endsem") });
    expect(await workflow.submitForReview(fa, ids.offeringId, "Attached end-sem paper")).toBe("RESUBMITTED");
    expect(await workflow.reviewOffering(cc, { offeringId: ids.offeringId, decision: "APPROVE" })).toBe("UNDER_REVIEW");
    expect(await workflow.reviewOffering(pc, { offeringId: ids.offeringId, decision: "APPROVE" })).toBe("UNDER_REVIEW");
    const stage = (await sql<{ review_stage: string }>("select review_stage from course_offerings where id = $1", [ids.offeringId]))[0].review_stage;
    expect(stage).toBe("HOD");
    expect(await workflow.reviewOffering(hod, { offeringId: ids.offeringId, decision: "APPROVE", comment: "Approved" })).toBe("LOCKED");

    const hist = await workflow.getWorkflowHistory(fa, ids.offeringId);
    expect(hist.history.map((h) => h.action).reverse()).toEqual(["SUBMIT", "APPROVE_STAGE", "RETURN", "RESUBMIT", "APPROVE_STAGE", "APPROVE_STAGE", "APPROVE", "LOCK"]);
    expect(hist.versions[0].label).toBe("2025-26 Version 1");

    // status cannot be changed outside the workflow, even directly in SQL
    await expect(sqlAs(pc.id, "update course_offerings set status = 'DRAFT' where id = $1", [ids.offeringId])).rejects.toThrow(/approval workflow/);
    await expect(sqlAs(fa.id, "delete from student_marks where offering_id = $1", [ids.offeringId])).rejects.toThrow(/locked/);
    await expect(attainment.calculateCourseAttainment(fa, ids.offeringId)).rejects.toThrow(/locked/i);
  });

  it("IQAC sees the course in the institution dashboard; program attainment and reports are generated", async () => {
    const iqac = await actor("iqac@obe.local");
    const rows = await dash.offeringsOverview(iqac, { academicYearId: ids.ay });
    const me301 = rows.find((r) => r.course_code === "ME301")!;
    expect(me301.status).toBe("LOCKED");
    expect(me301.completion).toBe(100);

    const pc = await actor("pc.me@obe.local");
    const prog = await attainment.calculateProgramAttainment(pc, ids.programId, ids.ay);
    expect(prog.coursesIncluded).toBe(1);
    expect(prog.provisional).toBe(false);
    const course = await attainment.getCourseAttainment(iqac, ids.offeringId);
    const cPo1 = course.po.find((p) => p.code === "PO1")!.value_pct;
    expect(prog.po.find((p) => p.outcomeCode === "PO1")!.valuePct).toBe(cPo1);

    const courseReport = await buildCourseReport(iqac, ids.offeringId, "COURSE_ATTAINMENT", "IQAC");
    expect(courseReport.sections.map((s) => s.heading)).toContain("Final Course Attainment");
    for (const fmt of ["PDF", "XLSX", "CSV"] as const) {
      const out = render(courseReport, fmt);
      expect(out.data.length).toBeGreaterThan(500);
    }
    expect(render(courseReport, "PDF").data.subarray(0, 4).toString()).toBe("%PDF");
    for (const t of ["COURSE_PO_PSO", "COURSE_GAP"] as const) expect((await buildCourseReport(iqac, ids.offeringId, t, "IQAC")).sections.length).toBeGreaterThan(0);
    const programReport = await buildProgramReport(iqac, ids.programId, ids.ay, "PROGRAM_ATTAINMENT", "IQAC");
    expect(programReport.sections[0].rows).toHaveLength(12);
    const gapReport = await buildProgramReport(iqac, ids.programId, ids.ay, "PROGRAM_GAP", "IQAC");
    expect(gapReport.sections.length).toBe(2);
  });

  it("revision request creates version 2 and preserves the approved version", async () => {
    const fa = await actor("faculty.a@obe.local");
    const pc = await actor("pc.me@obe.local");
    await expect(workflow.requestRevision(fa, ids.offeringId, "short")).rejects.toThrow(/10 characters/);
    const req = await workflow.requestRevision(fa, ids.offeringId, "CO4 statement needs correction as per BoS");
    expect(await workflow.decideRevision(pc, req.id, true, "Approved for correction").then((r) => r.s)).toBe("DRAFT");
    const o = (await sql<{ status: string; version: number }>("select status, version from course_offerings where id = $1", [ids.offeringId]))[0];
    expect(o).toEqual({ status: "DRAFT", version: 2 });
    const v1 = await workflow.getVersionSnapshot(fa, ids.offeringId, 1);
    expect((v1!.snapshot.course_outcomes as unknown[]).length).toBe(5);
    // edits allowed again, previous calculation history retained
    await ws.saveObjectives(fa, { offeringId: ids.offeringId, items: (await ws.getObjectives(fa, ids.offeringId)).map((x) => ({ id: x.id, description: x.description })) });
    const runs = await sql<{ n: number }>("select count(*)::int n from calculation_runs where offering_id = $1 and run_type = 'COURSE'", [ids.offeringId]);
    expect(runs[0].n).toBe(2);
  });

  it("every major event is in the audit trail", async () => {
    const actions = await sql<{ k: string }>("select distinct entity || ':' || action k from audit_logs");
    const keys = actions.map((a) => a.k);
    for (const k of ["programs:INSERT", "courses:INSERT", "faculty_assignments:INSERT", "syllabus:INSERT", "course_outcomes:INSERT", "co_po_mappings:INSERT",
      "assessments:INSERT", "marks_uploads:MARKS_UPLOADED", "calculation_runs:ATTAINMENT_CALCULATED", "feedback_templates:FEEDBACK_SUBMITTED",
      "ai_suggestions:AI_SUGGESTION_GENERATED", "ai_suggestions:UPDATE", "course_offerings:UPDATE"]) {
      expect(keys, k).toContain(k);
    }
    const withUser = await sql<{ n: number }>("select count(*)::int n from audit_logs where entity = 'programs' and user_id is not null and role = 'HOD'");
    expect(withUser[0].n).toBeGreaterThan(0);
  });
});
