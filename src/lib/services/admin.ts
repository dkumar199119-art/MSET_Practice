/** Administration: structure, users/roles, settings, methodology, audit. */
import { z } from "zod";
import { hashPassword } from "../auth/user";
import { DEFAULT_METHODOLOGY, methodologySchema, type Methodology } from "../domain/methodology";
import { can, ROLES } from "../rbac";
import { ensure, parse, tx, type Actor } from "./base";

const uuid = z.string().uuid();

export function getStructure(actor: Actor) {
  return tx(actor, async (db) => ({
    institution: await db.maybe<{ id: string; name: string; code: string; address: string | null }>("select id, name, code, address from institutions limit 1"),
    schools: await db.query<{ id: string; name: string; code: string }>("select id, name, code from schools order by name"),
    departments: await db.query<{ id: string; name: string; code: string; school_id: string; school_name: string; hod: string | null; programs: number }>(`
      select d.id, d.name, d.code, d.school_id, s.name school_name,
        (select string_agg(u.full_name, ', ') from user_roles r join users u on u.id = r.user_id where r.role_code = 'HOD' and r.department_id = d.id) hod,
        (select count(*)::int from programs p where p.department_id = d.id) programs
      from departments d join schools s on s.id = d.school_id order by s.name, d.name`),
    years: await db.query<{ id: string; name: string; start_date: string; end_date: string; is_current: boolean }>("select id, name, start_date::text, end_date::text, is_current from academic_years order by start_date desc"),
    semesters: await db.query<{ id: string; name: string; term: string; academic_year: string }>("select s.id, s.name, s.term, ay.name academic_year from semesters s join academic_years ay on ay.id = s.academic_year_id order by ay.start_date desc, s.name"),
    batches: await db.query<{ id: string; name: string; start_year: number; end_year: number; department: string | null }>("select b.id, b.name, b.start_year, b.end_year, d.code department from batches b left join departments d on d.id = b.department_id order by b.start_year desc"),
  }));
}

export const schoolSchema = z.object({ name: z.string().trim().min(3).max(200), code: z.string().trim().min(2).max(20) });
export async function createSchool(actor: Actor, input: z.input<typeof schoolSchema>) {
  const d = parse(schoolSchema, input);
  return tx(actor, async (db) => {
    const inst = await db.one<{ id: string }>("select id from institutions limit 1");
    return (await db.one<{ id: string }>("insert into schools (institution_id, name, code) values ($1,$2,$3) returning id", [inst.id, d.name, d.code.toUpperCase()])).id;
  }, "SUPER_ADMIN");
}

export const departmentSchema = z.object({ schoolId: uuid, name: z.string().trim().min(3).max(200), code: z.string().trim().min(2).max(20) });
export async function createDepartment(actor: Actor, input: z.input<typeof departmentSchema>) {
  const d = parse(departmentSchema, input);
  return tx(actor, async (db) => (await db.one<{ id: string }>("insert into departments (school_id, name, code) values ($1,$2,$3) returning id", [d.schoolId, d.name, d.code.toUpperCase()])).id, "SUPER_ADMIN");
}

export const yearSchema = z.object({
  name: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the form 2025-26"),
  startDate: z.string().date(),
  endDate: z.string().date(),
  isCurrent: z.boolean().default(false),
});
export async function createAcademicYear(actor: Actor, input: z.input<typeof yearSchema>) {
  const d = parse(yearSchema, input);
  return tx(actor, async (db) => {
    const inst = await db.one<{ id: string }>("select id from institutions limit 1");
    if (d.isCurrent) await db.query("update academic_years set is_current = false where is_current");
    const y = await db.one<{ id: string }>("insert into academic_years (institution_id, name, start_date, end_date, is_current) values ($1,$2,$3,$4,$5) returning id", [inst.id, d.name, d.startDate, d.endDate, d.isCurrent]);
    await db.query("insert into semesters (academic_year_id, name, term) values ($1,'Odd Semester','ODD'), ($1,'Even Semester','EVEN')", [y.id]);
    return y.id;
  }, "SUPER_ADMIN");
}

export const batchSchema = z.object({ departmentId: uuid, name: z.string().trim().min(4).max(30), startYear: z.coerce.number().int().min(1990).max(2100), endYear: z.coerce.number().int().min(1990).max(2110) });
export async function createBatch(actor: Actor, input: z.input<typeof batchSchema>) {
  const d = parse(batchSchema, input);
  ensure(d.endYear > d.startYear, "End year must be after start year");
  return tx(actor, async (db) => {
    const inst = await db.one<{ id: string }>("select id from institutions limit 1");
    return (await db.one<{ id: string }>("insert into batches (institution_id, department_id, name, start_year, end_year) values ($1,$2,$3,$4,$5) returning id", [inst.id, d.departmentId, d.name, d.startYear, d.endYear])).id;
  }, "SUPER_ADMIN");
}

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------
export function listUsers(actor: Actor) {
  return tx(actor, (db) => db.query<{ id: string; email: string; full_name: string; designation: string | null; department: string | null; is_active: boolean; roles: string[]; last_login_at: string | null }>(`
    select u.id, u.email, u.full_name, u.designation, d.code department, u.is_active, u.last_login_at::text,
      coalesce((select array_agg(r.role_code || coalesce(' · ' || dd.code, '') || coalesce(' · ' || ss.code, '') order by r.role_code)
        from user_roles r left join departments dd on dd.id = r.department_id left join schools ss on ss.id = r.school_id where r.user_id = u.id), '{}') roles
    from users u left join departments d on d.id = u.department_id
    where not exists (select 1 from students s where s.user_id = u.id)
    order by u.full_name`));
}

export const userSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(3).max(200),
  designation: z.string().trim().max(100).optional().nullable(),
  departmentId: uuid.optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  roles: z.array(z.object({ role: z.enum(ROLES), departmentId: uuid.optional().nullable(), schoolId: uuid.optional().nullable() })).min(1),
});

export async function createUser(actor: Actor, input: z.input<typeof userSchema>) {
  const d = parse(userSchema, input);
  ensure(can(actor, "users.manage"), "Only a super admin can create users", "FORBIDDEN");
  for (const r of d.roles) {
    if (r.role === "HOD") ensure(r.departmentId, "HOD role requires a department");
    if (r.role === "DEAN") ensure(r.schoolId, "Dean role requires a school");
    ensure(!["PROGRAM_COORDINATOR", "COURSE_COORDINATOR", "STUDENT"].includes(r.role), `${r.role} is derived from assignments and cannot be granted directly`);
  }
  const hash = await hashPassword(d.password);
  return tx(actor, async (db) => {
    const inst = await db.one<{ id: string }>("select id from institutions limit 1");
    const school = d.departmentId ? (await db.one<{ school_id: string }>("select school_id from departments where id = $1", [d.departmentId])).school_id : null;
    const u = await db.one<{ id: string }>(
      "insert into users (institution_id, email, full_name, password_hash, designation, school_id, department_id) values ($1,lower($2),$3,$4,$5,$6,$7) returning id",
      [inst.id, d.email, d.fullName, hash, d.designation ?? null, school, d.departmentId ?? null]);
    for (const r of d.roles) {
      await db.query("insert into user_roles (user_id, role_code, department_id, school_id, created_by) values ($1,$2,$3,$4,$5)", [u.id, r.role, r.departmentId ?? null, r.schoolId ?? null, actor.id]);
    }
    return u.id;
  }, "SUPER_ADMIN");
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  ensure(userId !== actor.id, "You cannot deactivate yourself");
  return tx(actor, (db) => db.query("update users set is_active = $2 where id = $1", [userId, active]), "SUPER_ADMIN");
}

// ---------------------------------------------------------------------------
// Settings & methodology
// ---------------------------------------------------------------------------
export const settingsSchema = z.object({
  camScaleMax: z.coerce.number().int().min(1).max(5),
  feedbackScaleMax: z.coerce.number().int().min(2).max(10),
  allowMultiCoQuestions: z.boolean(),
  hodApprovalRequired: z.boolean(),
  studentsCanViewAttainment: z.boolean(),
  requireEvidence: z.boolean(),
  requireActionPlanForGaps: z.boolean(),
  defaultCoTarget: z.coerce.number().min(0).max(100),
  defaultPoTarget: z.coerce.number().min(0).max(100),
  aiEnabled: z.boolean(),
  completionWeights: z.record(z.string(), z.coerce.number().min(0).max(100)),
});

export async function updateSettings(actor: Actor, input: z.input<typeof settingsSchema>) {
  const d = parse(settingsSchema, input);
  ensure(can(actor, "methodology.manage"), "Only IQAC or a super admin can change institutional settings", "FORBIDDEN");
  const total = Object.values(d.completionWeights).reduce((a, b) => a + b, 0);
  ensure(total > 0, "At least one completion weight must be positive");
  return tx(actor, (db) => db.query(
    `update institution_settings set cam_scale_max=$1, feedback_scale_max=$2, allow_multi_co_questions=$3, hod_approval_required=$4,
       students_can_view_attainment=$5, require_evidence=$6, require_action_plan_for_gaps=$7, default_co_target=$8, default_po_target=$9,
       ai_enabled=$10, completion_weights=$11`,
    [d.camScaleMax, d.feedbackScaleMax, d.allowMultiCoQuestions, d.hodApprovalRequired, d.studentsCanViewAttainment, d.requireEvidence,
      d.requireActionPlanForGaps, d.defaultCoTarget, d.defaultPoTarget, d.aiEnabled, JSON.stringify(d.completionWeights)]), "IQAC_ADMIN");
}

export function listMethodologies(actor: Actor) {
  return tx(actor, (db) => db.query<{ id: string; version: number; name: string; config: Methodology; is_active: boolean; program_code: string | null; created_at: string; created_by_name: string | null }>(`
    select m.id, m.version, m.name, m.config, m.is_active, p.code program_code, m.created_at::text, u.full_name created_by_name
    from attainment_methodologies m left join programs p on p.id = m.program_id left join users u on u.id = m.created_by
    order by m.program_id nulls first, m.version desc`));
}

/** Methodology changes create a new version; previous versions remain for traceability. */
export async function publishMethodology(actor: Actor, input: { name: string; programId?: string | null; config: unknown }) {
  const cfg = parse(methodologySchema, { ...DEFAULT_METHODOLOGY, ...(input.config as object) });
  const name = parse(z.string().trim().min(3).max(200), input.name);
  return tx(actor, async (db) => {
    const inst = await db.one<{ id: string }>("select id from institutions limit 1");
    const next = await db.one<{ v: number }>(
      "select coalesce(max(version), 0) + 1 v from attainment_methodologies where coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)",
      [input.programId ?? null]);
    await db.query("update attainment_methodologies set is_active = false where is_active and coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)", [input.programId ?? null]);
    const r = await db.one<{ id: string }>(
      "insert into attainment_methodologies (institution_id, program_id, version, name, config, is_active, created_by) values ($1,$2,$3,$4,$5,true,$6) returning id",
      [inst.id, input.programId ?? null, next.v, name, JSON.stringify(cfg), actor.id]);
    return { id: r.id, version: next.v };
  }, "IQAC_ADMIN");
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export const auditFilterSchema = z.object({ entity: z.string().optional(), offeringId: uuid.optional(), limit: z.coerce.number().int().min(1).max(500).default(200) });
export function listAudit(actor: Actor, input: z.input<typeof auditFilterSchema> = {}) {
  const f = parse(auditFilterSchema, input);
  return tx(actor, (db) => db.query<{ id: number; user_name: string | null; role: string | null; action: string; entity: string; entity_id: string | null; offering_id: string | null; old_value: unknown; new_value: unknown; created_at: string }>(`
    select a.id, u.full_name user_name, a.role, a.action, a.entity, a.entity_id, a.offering_id, a.old_value, a.new_value, a.created_at::text
    from audit_logs a left join users u on u.id = a.user_id
    where ($1::text is null or a.entity = $1) and ($2::uuid is null or a.offering_id = $2)
    order by a.id desc limit $3`, [f.entity ?? null, f.offeringId ?? null, f.limit]));
}
