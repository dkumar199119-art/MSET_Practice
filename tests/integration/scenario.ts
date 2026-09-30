/**
 * The MVP acceptance scenario (spec §60) expressed as reusable steps over the
 * real service layer. Used by the integration test and scripts/demo-lifecycle.ts.
 */
import { loadCurrentUser } from "../../src/lib/auth/user";
import * as academic from "../../src/lib/services/academic";
import * as ws from "../../src/lib/services/workspace";
import * as marks from "../../src/lib/services/marks";
import * as feedback from "../../src/lib/services/feedback";
import type { CurrentUser } from "../../src/lib/rbac";
import type { MarksRowRaw } from "../../src/lib/domain/marks";
import { withSystem } from "../../src/lib/db";

export async function actor(email: string): Promise<CurrentUser> {
  const id = await withSystem(async (db) => (await db.one<{ id: string }>("select id from users where email = $1", [email])).id);
  const u = await loadCurrentUser(id);
  if (!u) throw new Error(`No active user ${email}`);
  return u;
}

export async function refs() {
  return withSystem(async (db) => ({
    deptMe: (await db.one<{ id: string }>("select id from departments where code = 'ME'")).id,
    ay: (await db.one<{ id: string }>("select id from academic_years where name = '2025-26'")).id,
    odd: (await db.one<{ id: string }>("select s.id from semesters s join academic_years ay on ay.id = s.academic_year_id where ay.name = '2025-26' and s.term = 'ODD'")).id,
    batch: (await db.one<{ id: string }>("select b.id from batches b join departments d on d.id = b.department_id where d.code = 'ME' and b.name = '2023-27'")).id,
  }));
}

export const COS = [
  { description: "Apply principles of statics to determine resultants and equilibrium of coplanar force systems.", bloomLevel: "APPLY" as const },
  { description: "Analyze friction problems and plane trusses to determine support reactions and member forces.", bloomLevel: "ANALYZE" as const },
  { description: "Compute centroids and area moments of inertia of composite plane sections.", bloomLevel: "APPLY" as const, target: 65 },
  { description: "Solve kinematic problems of particles in rectilinear and curvilinear motion.", bloomLevel: "APPLY" as const },
  { description: "Evaluate dynamic systems using work-energy and impulse-momentum principles.", bloomLevel: "EVALUATE" as const },
];

const CAM_PO: Record<number, Record<string, number>> = {
  0: { PO1: 3, PO2: 2 },
  1: { PO1: 3, PO2: 3, PO4: 1 },
  2: { PO1: 2, PO2: 2, PO5: 1 },
  3: { PO1: 3, PO2: 2 },
  4: { PO1: 2, PO2: 3, PO3: 1, PO4: 2 },
};
const CAM_PSO: Record<number, Record<string, number>> = { 0: { PSO1: 2 }, 1: { PSO1: 3 }, 2: { PSO1: 1 }, 4: { PSO1: 2, PSO2: 1 } };

/** HOD → Program → PC → PSOs → Course → CC → allocation to Faculty A. Returns ids. */
export async function setupProgramAndAllocation() {
  const r = await refs();
  const hod = await actor("hod.me@obe.local");
  const programId = await academic.createProgram(hod, {
    departmentId: r.deptMe, code: "BTECH-ME", name: "B.Tech Mechanical Engineering", level: "UG", durationYears: 4, initializeStandardPOs: true,
  });
  const pcUser = await actor("pc.me@obe.local");
  await academic.assignProgramCoordinator(hod, programId, pcUser.id);

  const pc = await actor("pc.me@obe.local");
  await academic.upsertOutcome(pc, { kind: "PSO", programId, code: "PSO1", title: "Mechanical design & analysis", description: "Design and analyse mechanical components and systems using principles of mechanics and modern tools." });
  await academic.upsertOutcome(pc, { kind: "PSO", programId, code: "PSO2", title: "Thermal & manufacturing systems", description: "Apply knowledge of thermal and manufacturing sciences to solve industrial engineering problems." });
  const courseId = await academic.createCourse(pc, {
    programId, code: "ME301", name: "Engineering Mechanics", semesterNumber: 3, credits: 4, lectureHours: 3, tutorialHours: 1, practicalHours: 0, courseType: "THEORY", category: "ES",
  });
  const ccUser = await actor("cc.me@obe.local");
  await academic.assignCourseCoordinator(pc, courseId, ccUser.id);

  const cc = await actor("cc.me@obe.local");
  const fa = await actor("faculty.a@obe.local");
  const offeringId = await academic.allocateFaculty(cc, {
    courseId, facultyId: fa.id, academicYearId: r.ay, semesterId: r.odd, batchId: r.batch, section: "A", courseRole: "COURSE_INSTRUCTOR",
  });
  return { programId, courseId, offeringId, ...r };
}

/** Faculty completes syllabus → objectives → COs → Bloom → targets → CAM → assessments → enrollment. */
export async function facultyCourseSetup(offeringId: string) {
  const f = await actor("faculty.a@obe.local");
  await ws.confirmProfile(f, offeringId);
  await ws.saveSyllabus(f, {
    offeringId,
    overview: "<p>Statics and dynamics of rigid bodies and particles for engineering analysis.</p>",
    teachingMethodology: "Lectures, tutorials, problem-based learning, demonstrations.",
    referenceBooks: "Beer & Johnston, Vector Mechanics for Engineers; Hibbeler, Engineering Mechanics.",
    digitalResources: "NPTEL Engineering Mechanics; MIT OCW 2.001",
    units: [
      { unitNo: 1, title: "Fundamentals of Statics", topics: "Force systems, resultants, free-body diagrams, equilibrium", hours: 9 },
      { unitNo: 2, title: "Friction and Trusses", topics: "Coulomb friction, wedges, method of joints and sections", hours: 9 },
      { unitNo: 3, title: "Centroid and Moment of Inertia", topics: "Centroids, parallel axis theorem, composite areas", hours: 9 },
      { unitNo: 4, title: "Kinematics of Particles", topics: "Rectilinear and curvilinear motion, projectiles", hours: 9 },
      { unitNo: 5, title: "Kinetics of Particles", topics: "Newton's laws, work-energy, impulse-momentum", hours: 9 },
    ],
  });
  await ws.saveObjectives(f, {
    offeringId,
    items: [
      { description: "Introduce the principles of statics and equilibrium of rigid bodies." },
      { description: "Develop the ability to analyse friction and structural trusses." },
      { description: "Impart methods to compute geometric properties of plane sections." },
      { description: "Develop understanding of kinematics and kinetics of particles." },
    ],
  });
  await ws.saveOutcomes(f, { offeringId, items: COS.map((c) => ({ description: c.description, bloomLevel: c.bloomLevel })) });
  const cos = (await ws.getOutcomes(f, offeringId)).cos;
  await ws.saveBloomLevels(f, { offeringId, levels: Object.fromEntries(cos.map((c, i) => [c.id, COS[i].bloomLevel])) });
  await ws.saveTargets(f, { offeringId, courseDefault: 60, rationale: "Institutional benchmark", coTargets: Object.fromEntries(cos.map((c, i) => [c.id, COS[i].target ?? null])) });

  for (const kind of ["PO", "PSO"] as const) {
    const m = await ws.getMatrix(f, offeringId, kind);
    const src = kind === "PO" ? CAM_PO : CAM_PSO;
    const cells: Record<string, Record<string, number>> = {};
    m.cos.forEach((co, i) => {
      cells[co.id] = Object.fromEntries(m.outcomes.map((o) => [o.id, src[i]?.[o.code] ?? 0]));
    });
    await ws.saveMatrix(f, { offeringId, kind, cells });
  }

  const byIdx = (i: number) => cos[i].id;
  await ws.saveAssessments(f, {
    offeringId,
    items: [
      { name: "Mid Term", assessmentType: "MIDTERM", maxMarks: 30, weightage: 30, questions: [
        { label: "Q1", maxMarks: 10, coIds: [byIdx(0)] }, { label: "Q2", maxMarks: 10, coIds: [byIdx(1)] }, { label: "Q3", maxMarks: 10, coIds: [byIdx(2)] }] },
      { name: "End Semester", assessmentType: "END_SEMESTER", maxMarks: 60, weightage: 60, questions: [
        { label: "Q1", maxMarks: 12, coIds: [byIdx(0)] }, { label: "Q2", maxMarks: 12, coIds: [byIdx(1)] }, { label: "Q3", maxMarks: 12, coIds: [byIdx(2)] },
        { label: "Q4", maxMarks: 12, coIds: [byIdx(3)] }, { label: "Q5", maxMarks: 12, coIds: [byIdx(4)] }] },
      { name: "Assignment", assessmentType: "ASSIGNMENT", maxMarks: 10, weightage: 10, questions: [
        { label: "A1", maxMarks: 5, coIds: [byIdx(3)] }, { label: "A2", maxMarks: 5, coIds: [byIdx(4), byIdx(3)] }] },
    ],
  });
  const enrolled = await ws.enrollBatch(f, offeringId);
  return { faculty: f, cos, enrolled };
}

const DIFFICULTY = [0, 0.04, -0.02, 0.1, 0.3];
const noise = (a: number, b: number) => (((Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1) + 1) % 1;

/** Deterministic marks sheet in the long upload format. */
export async function buildMarksRows(offeringId: string): Promise<MarksRowRaw[]> {
  const f = await actor("faculty.a@obe.local");
  const t = await marks.getMarksTemplate(f, offeringId);
  const coIndexByQ: Record<string, number> = { "Mid Term|Q1": 0, "Mid Term|Q2": 1, "Mid Term|Q3": 2, "End Semester|Q1": 0, "End Semester|Q2": 1, "End Semester|Q3": 2, "End Semester|Q4": 3, "End Semester|Q5": 4, "Assignment|A1": 3, "Assignment|A2": 4 };
  const rows: MarksRowRaw[] = [];
  let rowNumber = 2;
  t.students.forEach((s, si) => {
    const ability = 0.42 + 0.5 * noise(si + 1, 7);
    t.questions.forEach((q, qi) => {
      const co = coIndexByQ[`${q.assessment}|${q.label}`] ?? 0;
      const frac = Math.max(0, Math.min(1, ability - DIFFICULTY[co] + (noise(si, qi) - 0.5) * 0.25));
      rows.push({ rowNumber: rowNumber++, values: { studentId: s.roll_no, studentName: s.full_name, assessment: q.assessment, question: q.label, marks: Math.round(q.max_marks * frac * 2) / 2 } });
    });
  });
  return rows;
}

/** Enrolled students submit CO feedback (responseCount of them). */
export async function studentsSubmitFeedback(offeringId: string, responseCount: number) {
  const students = await withSystem((db) => db.query<{ email: string }>(
    "select u.email from enrollments e join students s on s.id = e.student_id join users u on u.id = s.user_id where e.offering_id = $1 order by s.roll_no limit $2", [offeringId, responseCount]));
  for (const [i, s] of students.entries()) {
    const st = await actor(s.email);
    const form = await feedback.getStudentFeedbackForm(st, offeringId);
    const ratings = Object.fromEntries(form.questions.map((q, qi) => [q.id, Math.max(1, Math.min(5, Math.round(3.4 + noise(i, qi) * 1.6 - (qi === 4 ? 0.6 : 0))))]));
    await feedback.submitFeedback(st, { templateId: form.template.id, ratings });
  }
  return students.length;
}
