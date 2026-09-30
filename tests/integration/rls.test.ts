/**
 * Row level security & RBAC enforced by the database — tested with raw SQL
 * as each role (bypassing the service layer) and through services.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDb, sql, sqlAs, userId } from "./helpers";
import { actor, buildMarksRows, facultyCourseSetup, setupProgramAndAllocation } from "./scenario";
import { closePool } from "../../src/lib/db";
import * as academic from "../../src/lib/services/academic";
import * as ws from "../../src/lib/services/workspace";
import * as marks from "../../src/lib/services/marks";
import { verifyCredentials } from "../../src/lib/auth/user";

let ids: Awaited<ReturnType<typeof setupProgramAndAllocation>>;

beforeAll(async () => {
  await resetTestDb(12);
  ids = await setupProgramAndAllocation();
  await facultyCourseSetup(ids.offeringId);
  const fa = await actor("faculty.a@obe.local");
  await marks.saveMarks(fa, { offeringId: ids.offeringId, fileName: "m.xlsx", rows: await buildMarksRows(ids.offeringId) });
});
afterAll(closePool);

describe("authentication", () => {
  it("verifies passwords and never exposes password hashes to the app role", async () => {
    expect(await verifyCredentials("faculty.a@obe.local", "Password@123")).toBeTruthy();
    expect(await verifyCredentials("faculty.a@obe.local", "wrong")).toBeNull();
    expect(await verifyCredentials("nobody@obe.local", "Password@123")).toBeNull();
    const fa = await userId("faculty.a@obe.local");
    await expect(sqlAs(fa, "select password_hash from users limit 1")).rejects.toThrow(/permission denied/);
  });
});

describe("faculty isolation", () => {
  it("unassigned faculty cannot see or modify the course", async () => {
    const fb = await actor("faculty.b@obe.local");
    await expect(ws.getWorkspace(fb, ids.offeringId)).rejects.toThrow(/not found or not accessible/);
    expect(await sqlAs(fb.id, "select * from course_outcomes where offering_id = $1", [ids.offeringId])).toHaveLength(0);
    expect(await sqlAs(fb.id, "select * from student_marks")).toHaveLength(0);
    await expect(sqlAs(fb.id, "insert into course_objectives (offering_id, code, description) values ($1, 'X1', 'Injected objective text')", [ids.offeringId])).rejects.toThrow(/row-level security/);
    const updated = await sqlAs(fb.id, "update student_marks set marks = 0 returning id");
    expect(updated).toHaveLength(0);
    expect(await ws.listMyCourses(fb)).toHaveLength(0);
  });

  it("assigned faculty can see only their course", async () => {
    const fa = await userId("faculty.a@obe.local");
    const offerings = await sqlAs<{ id: string }>(fa, "select id from course_offerings");
    expect(offerings.map((o) => o.id)).toEqual([ids.offeringId]);
    expect((await sqlAs(fa, "select * from student_marks")).length).toBeGreaterThan(0);
  });

  it("faculty cannot allocate courses or create courses", async () => {
    const fa = await actor("faculty.a@obe.local");
    const fb = await actor("faculty.b@obe.local");
    await expect(academic.allocateFaculty(fa, { courseId: ids.courseId, facultyId: fb.id, academicYearId: ids.ay, semesterId: ids.odd, batchId: ids.batch, section: "B", courseRole: "COURSE_INSTRUCTOR" })).rejects.toThrow(/permission|Coordinator/);
    await expect(sqlAs(fa.id, "insert into courses (program_id, code, name, semester_number, credits) values ($1,'ME399','Fake',3,3)", [ids.programId])).rejects.toThrow(/row-level security/);
  });
});

describe("hierarchy ownership", () => {
  it("HOD cannot edit faculty marks; PC cannot create programs; other-department HOD sees nothing", async () => {
    const hod = await userId("hod.me@obe.local");
    expect((await sqlAs(hod, "select * from student_marks")).length).toBeGreaterThan(0); // can review
    expect(await sqlAs(hod, "update student_marks set marks = 0 returning id")).toHaveLength(0);
    await expect(sqlAs(hod, "insert into course_outcomes (offering_id, code, description) values ($1,'CO9','Some outcome description text')", [ids.offeringId])).rejects.toThrow(/row-level security/);

    const pc = await actor("pc.me@obe.local");
    await expect(academic.createProgram(pc, { departmentId: ids.deptMe, code: "MTECH-ME", name: "M.Tech Mechanical", level: "PG", durationYears: 2 })).rejects.toThrow(/Head of Department/);
    await expect(sqlAs(pc.id, "insert into programs (department_id, code, name) values ($1,'X','X program')", [ids.deptMe])).rejects.toThrow(/row-level security/);

    const hodCse = await userId("hod.cse@obe.local");
    expect(await sqlAs(hodCse, "select * from programs")).toHaveLength(0);
    expect(await sqlAs(hodCse, "select * from course_offerings")).toHaveLength(0);
    const deptCse = (await sql<{ id: string }>("select id from departments where code = 'CSE'"))[0].id;
    await expect(sqlAs(hodCse, "insert into program_coordinators (program_id, user_id) values ($1,$2)", [ids.programId, hodCse])).rejects.toThrow(/row-level security/);
    void deptCse;
  });

  it("only the HOD of the department assigns program coordinators", async () => {
    const pc = await userId("pc.me@obe.local");
    const fb = await userId("faculty.b@obe.local");
    await expect(sqlAs(pc, "insert into program_coordinators (program_id, user_id) values ($1,$2)", [ids.programId, fb])).rejects.toThrow(/row-level security/);
  });

  it("IQAC reads institution-wide but cannot edit course data", async () => {
    const iqac = await userId("iqac@obe.local");
    expect(await sqlAs(iqac, "select * from course_offerings")).toHaveLength(1);
    expect((await sqlAs(iqac, "select * from audit_logs limit 5")).length).toBeGreaterThan(0);
    expect(await sqlAs(iqac, "update course_outcomes set description = 'x' returning id")).toHaveLength(0);
  });

  it("reviewer is read-only", async () => {
    const r = await userId("reviewer@obe.local");
    expect(await sqlAs(r, "select * from course_offerings")).toHaveLength(1);
    await expect(sqlAs(r, "insert into programs (department_id, code, name) values ($1,'R','R program')", [ids.deptMe])).rejects.toThrow(/row-level security/);
  });
});

describe("students", () => {
  it("see only their enrollment, COs for feedback, and never marks or attainment", async () => {
    const st = await userId("me23001@students.obe.local");
    const enr = await sqlAs(st, "select * from enrollments");
    expect(enr).toHaveLength(1);
    expect(await sqlAs(st, "select * from student_marks")).toHaveLength(0);
    expect(await sqlAs(st, "select * from direct_attainment")).toHaveLength(0);
    expect(await sqlAs(st, "select * from assessments")).toHaveLength(0);
    expect((await sqlAs(st, "select * from course_outcomes")).length).toBe(5);
    expect(await sqlAs(st, "select * from students")).toHaveLength(1);
    await expect(sqlAs(st, "insert into feedback_responses (template_id, offering_id, question_id, response_set, rating) values (gen_random_uuid(), $1, gen_random_uuid(), gen_random_uuid(), 5)", [ids.offeringId])).rejects.toThrow(/permission denied/);
  });
});

describe("audit & workflow integrity", () => {
  it("audit logs are append-only for the application", async () => {
    const admin = await userId("superadmin@obe.local");
    await expect(sqlAs(admin, "delete from audit_logs")).rejects.toThrow(/permission denied/);
    await expect(sqlAs(admin, "update audit_logs set action = 'x'")).rejects.toThrow(/permission denied/);
  });
  it("workflow history cannot be forged", async () => {
    const fa = await userId("faculty.a@obe.local");
    await expect(sqlAs(fa, "insert into approval_workflows (offering_id, action, from_status, to_status, actor_id, actor_role, version) values ($1,'APPROVE','DRAFT','LOCKED',$2,'HOD',1)", [ids.offeringId, fa])).rejects.toThrow(/permission denied/);
    await expect(sqlAs(fa, "select app.transition_offering($1, 'APPROVE', 'self approve')", [ids.offeringId])).rejects.toThrow(/not awaiting review/);
  });
  it("marks validation happens server side against enrollment", async () => {
    const fa = await actor("faculty.a@obe.local");
    const v = await marks.validateMarks(fa, { offeringId: ids.offeringId, fileName: "x.csv", rows: [{ rowNumber: 2, values: { studentId: "ME23012", assessment: "Mid Term", question: "Q9", marks: 1 } }] });
    expect(v.errors[0].message).toMatch(/does not exist/);
  });
});
