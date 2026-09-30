/**
 * Academic ownership workflow: HOD → Program → Program Coordinator → Course →
 * Course Coordinator → Faculty allocation (course offering).
 */
import { z } from "zod";
import type { Db } from "../db";
import { AppError } from "../errors";
import { STANDARD_ENGINEERING_POS } from "../domain/standard-outcomes";
import { can } from "../rbac";
import { ensure, logEvent, notify, parse, tx, type Actor } from "./base";

const uuid = z.string().uuid();
const pct = z.coerce.number().min(0).max(100);

// ---------------------------------------------------------------------------
// Programs (HOD)
// ---------------------------------------------------------------------------
export const createProgramSchema = z.object({
  departmentId: uuid,
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore"),
  name: z.string().trim().min(3).max(200),
  level: z.enum(["UG", "PG", "DIPLOMA", "DOCTORAL", "CERTIFICATE"]),
  durationYears: z.coerce.number().int().min(1).max(7),
  defaultCoTarget: pct.optional().nullable(),
  defaultPoTarget: pct.optional().nullable(),
  initializeStandardPOs: z.boolean().default(true),
});

export async function createProgram(actor: Actor, input: z.input<typeof createProgramSchema>) {
  const d = parse(createProgramSchema, input);
  ensure(can(actor, "program.create"), "Only the Head of Department can create programs", "FORBIDDEN");
  return tx(actor, async (db) => {
    const p = await db.one<{ id: string }>(
      `insert into programs (department_id, code, name, level, duration_years, default_co_target, default_po_target, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [d.departmentId, d.code.toUpperCase(), d.name, d.level, d.durationYears, d.defaultCoTarget ?? null, d.defaultPoTarget ?? null, actor.id],
    );
    if (d.initializeStandardPOs) {
      let i = 0;
      for (const po of STANDARD_ENGINEERING_POS) {
        await db.query(
          "insert into program_outcomes (program_id, code, title, description, sort_order) values ($1,$2,$3,$4,$5)",
          [p.id, po.code, po.title, po.description, i++],
        );
      }
    }
    return p.id;
  }, "HOD");
}

export async function assignProgramCoordinator(actor: Actor, programId: string, userId: string) {
  parse(uuid, programId);
  parse(uuid, userId);
  return tx(actor, async (db) => {
    const prog = await db.one<{ code: string; name: string }>("select code, name from programs where id = $1", [programId]);
    await db.query(
      `insert into program_coordinators (program_id, user_id, assigned_by) values ($1,$2,$3)
       on conflict (program_id, user_id) do update set is_active = true, assigned_by = excluded.assigned_by`,
      [programId, userId, actor.id],
    );
    await notify(db, userId, "Program Coordinator assignment", `You are now Program Coordinator of ${prog.code} ${prog.name}.`, `/programs/${programId}`);
  }, "HOD");
}

export async function removeProgramCoordinator(actor: Actor, programId: string, userId: string) {
  return tx(actor, (db) => db.query("update program_coordinators set is_active = false where program_id = $1 and user_id = $2", [programId, userId]), "HOD");
}

export const programSettingsSchema = z.object({
  programId: uuid,
  defaultCoTarget: pct.nullable(),
  defaultPoTarget: pct.nullable(),
});
export async function updateProgramTargets(actor: Actor, input: z.input<typeof programSettingsSchema>) {
  const d = parse(programSettingsSchema, input);
  return tx(actor, async (db) => {
    const r = await db.query("update programs set default_co_target = $2, default_po_target = $3 where id = $1 returning id", [d.programId, d.defaultCoTarget, d.defaultPoTarget]);
    ensure(r.length === 1, "You cannot manage this program", "FORBIDDEN");
  });
}

// ---------------------------------------------------------------------------
// POs / PSOs (Program Coordinator)
// ---------------------------------------------------------------------------
export const outcomeSchema = z.object({
  kind: z.enum(["PO", "PSO"]),
  programId: uuid,
  id: uuid.optional(),
  code: z.string().trim().min(2).max(12).regex(/^[A-Za-z]+\d+$/, "Codes look like PO1 / PSO2"),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(2000),
  target: pct.nullable().optional(),
});

export async function upsertOutcome(actor: Actor, input: z.input<typeof outcomeSchema>) {
  const d = parse(outcomeSchema, input);
  const table = d.kind === "PO" ? "program_outcomes" : "program_specific_outcomes";
  return tx(actor, async (db) => {
    if (d.id) {
      const r = await db.query(`update ${table} set code=$2, title=$3, description=$4, target=$5 where id=$1 and program_id=$6 returning id`, [d.id, d.code.toUpperCase(), d.title, d.description, d.target ?? null, d.programId]);
      ensure(r.length === 1, "Outcome not found or you cannot manage this program", "FORBIDDEN");
      return d.id;
    }
    const next = await db.one<{ n: number }>(`select coalesce(max(sort_order),-1)+1 as n from ${table} where program_id=$1`, [d.programId]);
    const r = await db.one<{ id: string }>(`insert into ${table} (program_id, code, title, description, target, sort_order) values ($1,$2,$3,$4,$5,$6) returning id`, [d.programId, d.code.toUpperCase(), d.title, d.description, d.target ?? null, next.n]);
    return r.id;
  });
}

export async function deleteOutcome(actor: Actor, kind: "PO" | "PSO", id: string) {
  const table = kind === "PO" ? "program_outcomes" : "program_specific_outcomes";
  return tx(actor, async (db) => {
    const r = await db.query(`delete from ${table} where id = $1 returning id`, [id]);
    ensure(r.length === 1, "Outcome not found or you cannot manage this program", "FORBIDDEN");
  });
}

// ---------------------------------------------------------------------------
// Courses (Program Coordinator)
// ---------------------------------------------------------------------------
export const courseSchema = z.object({
  programId: uuid,
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only"),
  name: z.string().trim().min(3).max(200),
  semesterNumber: z.coerce.number().int().min(1).max(14),
  credits: z.coerce.number().min(0).max(40),
  lectureHours: z.coerce.number().int().min(0).max(20),
  tutorialHours: z.coerce.number().int().min(0).max(20),
  practicalHours: z.coerce.number().int().min(0).max(40),
  courseType: z.enum(["THEORY", "LAB", "INTEGRATED", "PROJECT", "SEMINAR"]),
  category: z.enum(["BS", "ES", "HS", "PC", "PE", "OE", "PROJ", "MC"]),
});

export async function createCourse(actor: Actor, input: z.input<typeof courseSchema>) {
  const d = parse(courseSchema, input);
  ensure(can(actor, "course.create"), "Only the Program Coordinator can create courses", "FORBIDDEN");
  return tx(actor, async (db) => {
    const r = await db.one<{ id: string }>(
      `insert into courses (program_id, code, name, semester_number, credits, lecture_hours, tutorial_hours, practical_hours, course_type, category, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [d.programId, d.code.toUpperCase(), d.name, d.semesterNumber, d.credits, d.lectureHours, d.tutorialHours, d.practicalHours, d.courseType, d.category, actor.id],
    );
    return r.id;
  }, "PROGRAM_COORDINATOR");
}

export async function assignCourseCoordinator(actor: Actor, courseId: string, userId: string) {
  parse(uuid, courseId);
  parse(uuid, userId);
  return tx(actor, async (db) => {
    const c = await db.one<{ code: string; name: string }>("select code, name from courses where id = $1", [courseId]);
    await db.query(
      `insert into course_coordinators (course_id, user_id, assigned_by) values ($1,$2,$3)
       on conflict (course_id, user_id) do update set is_active = true, assigned_by = excluded.assigned_by`,
      [courseId, userId, actor.id],
    );
    await notify(db, userId, "Course Coordinator assignment", `You are Course Coordinator of ${c.code} ${c.name}. You can now allocate faculty.`, `/courses/${courseId}`);
  }, "PROGRAM_COORDINATOR");
}

export async function removeCourseCoordinator(actor: Actor, courseId: string, userId: string) {
  return tx(actor, (db) => db.query("update course_coordinators set is_active = false where course_id = $1 and user_id = $2", [courseId, userId]), "PROGRAM_COORDINATOR");
}

// ---------------------------------------------------------------------------
// Faculty allocation (Course Coordinator / Program Coordinator)
// ---------------------------------------------------------------------------
export const allocationSchema = z.object({
  courseId: uuid,
  facultyId: uuid,
  academicYearId: uuid,
  semesterId: uuid,
  batchId: uuid,
  section: z.string().trim().min(1).max(10),
  courseRole: z.enum(["COURSE_COORDINATOR", "COURSE_INSTRUCTOR", "LAB_INSTRUCTOR", "CO_INSTRUCTOR"]),
  deadline: z.string().date().optional().nullable(),
});

export async function allocateFaculty(actor: Actor, input: z.input<typeof allocationSchema>) {
  const d = parse(allocationSchema, input);
  ensure(can(actor, "course.allocate"), "Only the Course Coordinator or Program Coordinator can allocate faculty", "FORBIDDEN");
  return tx(actor, async (db) => {
    const sem = await db.maybe("select 1 from semesters where id = $1 and academic_year_id = $2", [d.semesterId, d.academicYearId]);
    ensure(sem, "Semester does not belong to the selected academic year");
    const allowed = await db.one<{ ok: boolean }>("select app.can_allocate_course($1) ok", [d.courseId]);
    ensure(allowed.ok, "You are not the Course Coordinator or Program Coordinator of this course", "FORBIDDEN");
    const course = await db.one<{ code: string; name: string }>("select code, name from courses where id = $1", [d.courseId]);
    const fac = await db.maybe("select 1 from users where id = $1 and is_active", [d.facultyId]);
    ensure(fac, "Selected faculty member not found");

    let off = await db.maybe<{ id: string }>(
      "select id from course_offerings where course_id=$1 and academic_year_id=$2 and semester_id=$3 and batch_id=$4 and section=$5",
      [d.courseId, d.academicYearId, d.semesterId, d.batchId, d.section.toUpperCase()],
    );
    if (!off) {
      off = await db.one<{ id: string }>(
        `insert into course_offerings (course_id, academic_year_id, semester_id, batch_id, section, deadline, created_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [d.courseId, d.academicYearId, d.semesterId, d.batchId, d.section.toUpperCase(), d.deadline ?? null, actor.id],
      );
    }
    const existing = await db.maybe("select 1 from faculty_assignments where offering_id=$1 and user_id=$2 and course_role=$3 and is_active", [off.id, d.facultyId, d.courseRole]);
    ensure(!existing, "This faculty member already holds that role for the selected offering", "CONFLICT");
    await db.query(
      `insert into faculty_assignments (offering_id, user_id, course_role, assigned_by) values ($1,$2,$3,$4)
       on conflict (offering_id, user_id, course_role) do update set is_active = true, assigned_by = excluded.assigned_by`,
      [off.id, d.facultyId, d.courseRole, actor.id],
    );
    await notify(db, d.facultyId, "New Course Assigned", `${course.code} ${course.name} (Section ${d.section.toUpperCase()}) has been allocated to you. Please complete the course setup.`, `/workspace/${off.id}`);
    return off.id;
  }, "COURSE_COORDINATOR");
}

export async function deactivateAssignment(actor: Actor, assignmentId: string) {
  return tx(actor, async (db) => {
    const r = await db.query("update faculty_assignments set is_active = false where id = $1 returning id", [assignmentId]);
    ensure(r.length === 1, "Assignment not found or not permitted", "FORBIDDEN");
  }, "COURSE_COORDINATOR");
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export interface ProgramRow {
  id: string; code: string; name: string; level: string; department_id: string; department_name: string;
  school_name: string; course_count: number; coordinators: string | null; can_manage: boolean;
}

export function listPrograms(actor: Actor): Promise<ProgramRow[]> {
  return tx(actor, (db) =>
    db.query<ProgramRow>(`
      select p.id, p.code, p.name, p.level, p.department_id, d.name department_name, s.name school_name,
        (select count(*)::int from courses c where c.program_id = p.id) course_count,
        (select string_agg(u.full_name, ', ') from program_coordinators pc join users u on u.id = pc.user_id where pc.program_id = p.id and pc.is_active) coordinators,
        app.can_manage_program(p.id) can_manage
      from programs p join departments d on d.id = p.department_id join schools s on s.id = d.school_id
      order by s.name, d.name, p.code`),
  );
}

export async function getProgram(actor: Actor, programId: string) {
  return tx(actor, async (db) => {
    const program = await db.maybe<{
      id: string; code: string; name: string; level: string; duration_years: number; department_id: string; department_name: string;
      default_co_target: number | null; default_po_target: number | null; can_manage: boolean; is_hod: boolean;
    }>(
      `select p.*, d.name department_name, app.can_manage_program(p.id) can_manage, app.is_hod_of(p.department_id) is_hod
       from programs p join departments d on d.id = p.department_id where p.id = $1`,
      [programId],
    );
    if (!program) throw new AppError("Program not found or not accessible", "NOT_FOUND");
    const coordinators = await db.query<{ user_id: string; full_name: string; email: string }>(
      "select pc.user_id, u.full_name, u.email from program_coordinators pc join users u on u.id = pc.user_id where pc.program_id = $1 and pc.is_active order by u.full_name",
      [programId],
    );
    const pos = await db.query<{ id: string; code: string; title: string; description: string; target: number | null }>(
      "select id, code, title, description, target from program_outcomes where program_id = $1 order by sort_order, code", [programId]);
    const psos = await db.query<{ id: string; code: string; title: string; description: string; target: number | null }>(
      "select id, code, title, description, target from program_specific_outcomes where program_id = $1 order by sort_order, code", [programId]);
    const courses = await listCoursesForProgram(db, programId);
    return { program, coordinators, pos, psos, courses };
  });
}

export interface CourseRow {
  id: string; code: string; name: string; semester_number: number; credits: number; course_type: string; category: string;
  lecture_hours: number; tutorial_hours: number; practical_hours: number;
  coordinators: string | null; offering_count: number; can_allocate: boolean;
}

function listCoursesForProgram(db: Db, programId: string) {
  return db.query<CourseRow>(`
    select c.id, c.code, c.name, c.semester_number, c.credits, c.course_type, c.category, c.lecture_hours, c.tutorial_hours, c.practical_hours,
      (select string_agg(u.full_name, ', ') from course_coordinators cc join users u on u.id = cc.user_id where cc.course_id = c.id and cc.is_active) coordinators,
      (select count(*)::int from course_offerings o where o.course_id = c.id) offering_count,
      app.can_allocate_course(c.id) can_allocate
    from courses c where c.program_id = $1 order by c.semester_number, c.code`, [programId]);
}

export function listCourses(actor: Actor) {
  return tx(actor, (db) =>
    db.query<CourseRow & { program_code: string; program_id: string; program_name: string }>(`
      select c.id, c.code, c.name, c.semester_number, c.credits, c.course_type, c.category, c.lecture_hours, c.tutorial_hours, c.practical_hours,
        p.code program_code, p.id program_id, p.name program_name,
        (select string_agg(u.full_name, ', ') from course_coordinators cc join users u on u.id = cc.user_id where cc.course_id = c.id and cc.is_active) coordinators,
        (select count(*)::int from course_offerings o where o.course_id = c.id) offering_count,
        app.can_allocate_course(c.id) can_allocate
      from courses c join programs p on p.id = c.program_id order by p.code, c.semester_number, c.code`),
  );
}

export async function getCourse(actor: Actor, courseId: string) {
  return tx(actor, async (db) => {
    const course = await db.maybe<CourseRow & { program_id: string; program_code: string; program_name: string; department_id: string; can_manage: boolean }>(`
      select c.*, p.code program_code, p.name program_name, p.department_id,
        app.can_allocate_course(c.id) can_allocate, app.can_manage_program(p.id) can_manage,
        (select string_agg(u.full_name, ', ') from course_coordinators cc join users u on u.id = cc.user_id where cc.course_id = c.id and cc.is_active) coordinators,
        (select count(*)::int from course_offerings o where o.course_id = c.id) offering_count
      from courses c join programs p on p.id = c.program_id where c.id = $1`, [courseId]);
    if (!course) throw new AppError("Course not found or not accessible", "NOT_FOUND");
    const coordinators = await db.query<{ user_id: string; full_name: string }>(
      "select cc.user_id, u.full_name from course_coordinators cc join users u on u.id = cc.user_id where cc.course_id = $1 and cc.is_active", [courseId]);
    const offerings = await db.query<{
      id: string; academic_year: string; semester: string; batch: string; section: string; status: string; deadline: string | null;
      faculty: { assignment_id: string; user_id: string; full_name: string; course_role: string }[];
    }>(`
      select o.id, ay.name academic_year, s.name semester, b.name batch, o.section, o.status, o.deadline::text,
        coalesce((select json_agg(json_build_object('assignment_id', fa.id, 'user_id', fa.user_id, 'full_name', u.full_name, 'course_role', fa.course_role) order by u.full_name)
                  from faculty_assignments fa join users u on u.id = fa.user_id where fa.offering_id = o.id and fa.is_active), '[]') faculty
      from course_offerings o join academic_years ay on ay.id = o.academic_year_id join semesters s on s.id = o.semester_id join batches b on b.id = o.batch_id
      where o.course_id = $1 order by ay.start_date desc, s.name, o.section`, [courseId]);
    return { course, coordinators, offerings };
  });
}

/** Staff directory for coordinator/faculty pickers (department-first). */
export function listStaff(actor: Actor, departmentId?: string | null) {
  return tx(actor, (db) =>
    db.query<{ id: string; full_name: string; email: string; designation: string | null; department_id: string | null; department_code: string | null }>(`
      select u.id, u.full_name, u.email, u.designation, u.department_id, d.code department_code
      from users u left join departments d on d.id = u.department_id
      where u.is_active and exists (select 1 from user_roles r where r.user_id = u.id and r.role_code <> 'STUDENT')
        and not exists (select 1 from students st where st.user_id = u.id)
      order by (u.department_id is not distinct from $1) desc, u.full_name`, [departmentId ?? null]),
  );
}

export function listCalendar(actor: Actor) {
  return tx(actor, async (db) => ({
    years: await db.query<{ id: string; name: string; is_current: boolean }>("select id, name, is_current from academic_years order by start_date desc"),
    semesters: await db.query<{ id: string; name: string; academic_year_id: string; term: string }>("select id, name, academic_year_id, term from semesters order by name"),
    batches: await db.query<{ id: string; name: string; department_id: string | null; program_id: string | null }>("select id, name, department_id, program_id from batches order by start_year desc"),
  }));
}
