import bcrypt from "bcryptjs";
import { withUser } from "../db";
import type { CurrentUser, Role } from "../rbac";

/** Resolves base roles plus roles derived from coordinator/faculty assignments. */
export async function loadCurrentUser(userId: string): Promise<CurrentUser | null> {
  return withUser({ userId }, async (db) => {
    const u = await db.maybe<{ id: string; email: string; full_name: string; designation: string | null; department_id: string | null; is_active: boolean }>(
      "select id, email, full_name, designation, department_id, is_active from users where id = $1",
      [userId],
    );
    if (!u || !u.is_active) return null;
    const roles = await db.query<{ role_code: Role; school_id: string | null; department_id: string | null }>(
      "select role_code, school_id, department_id from user_roles where user_id = $1",
      [userId],
    );
    const pcs = await db.query<{ program_id: string }>("select program_id from program_coordinators where user_id = $1 and is_active", [userId]);
    const ccs = await db.query<{ course_id: string }>("select course_id from course_coordinators where user_id = $1 and is_active", [userId]);
    const fa = await db.one<{ n: number }>("select count(*)::int n from faculty_assignments where user_id = $1 and is_active", [userId]);
    const student = await db.maybe<{ id: string }>("select id from students where user_id = $1", [userId]);

    const set = new Set<Role>(roles.map((r) => r.role_code));
    if (pcs.length) set.add("PROGRAM_COORDINATOR");
    if (ccs.length) set.add("COURSE_COORDINATOR");
    if (fa.n > 0) set.add("FACULTY");
    if (student) set.add("STUDENT");

    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      designation: u.designation,
      departmentId: u.department_id,
      roles: [...set],
      scopes: {
        hodDepartments: roles.filter((r) => r.role_code === "HOD" && r.department_id).map((r) => r.department_id!),
        deanSchools: roles.filter((r) => r.role_code === "DEAN" && r.school_id).map((r) => r.school_id!),
        pcPrograms: pcs.map((p) => p.program_id),
        ccCourses: ccs.map((c) => c.course_id),
        assignedOfferings: fa.n,
      },
      studentId: student?.id ?? null,
    };
  });
}

export async function verifyCredentials(email: string, password: string): Promise<string | null> {
  return withUser({ userId: null }, async (db) => {
    const row = await db.maybe<{ id: string; password_hash: string | null; is_active: boolean }>(
      "select * from app.auth_lookup($1)",
      [email.trim()],
    );
    // constant-ish time: always run a compare
    const hash = row?.password_hash ?? "$2b$10$abcdefghijklmnopqrstuuJ0yB8VQ1c8o9dZrV7p5bYp0mH3rS8m";
    const ok = await bcrypt.compare(password, hash);
    if (!row || !row.is_active || !ok) return null;
    await db.query("select app.record_login($1)", [row.id]);
    return row.id;
  });
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
