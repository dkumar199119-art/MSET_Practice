/**
 * Seeds the base institutional structure and demo users for every role.
 * Programs and courses are intentionally NOT seeded: they are created through
 * the academic ownership workflow (HOD → Program → PC → Course → CC → Faculty).
 *
 *   npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { DEFAULT_METHODOLOGY } from "../src/lib/domain/methodology";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES } from "../src/lib/rbac";

export const DEMO_PASSWORD = "Password@123";

export const DEMO_USERS = [
  { key: "admin", email: "superadmin@obe.local", name: "System Administrator", designation: "Super Admin", roles: [{ role: "SUPER_ADMIN" }] },
  { key: "iqac", email: "iqac@obe.local", name: "Dr. Meera Iyer", designation: "IQAC Coordinator", roles: [{ role: "IQAC_ADMIN" }] },
  { key: "director", email: "director@obe.local", name: "Dr. Rajan Menon", designation: "Director", roles: [{ role: "DIRECTOR" }] },
  { key: "dean", email: "dean.engg@obe.local", name: "Dr. Sunita Kulkarni", designation: "Dean, Engineering", roles: [{ role: "DEAN", school: "SOE" }, { role: "FACULTY" }] },
  { key: "hodMe", email: "hod.me@obe.local", name: "Dr. Arvind Deshmukh", designation: "Professor & HOD", dept: "ME", roles: [{ role: "HOD", dept: "ME" }, { role: "FACULTY" }] },
  { key: "pcMe", email: "pc.me@obe.local", name: "Dr. Kavita Joshi", designation: "Associate Professor", dept: "ME", roles: [{ role: "FACULTY" }] },
  { key: "ccMe", email: "cc.me@obe.local", name: "Prof. Nikhil Patil", designation: "Assistant Professor", dept: "ME", roles: [{ role: "FACULTY" }] },
  { key: "facultyA", email: "faculty.a@obe.local", name: "Prof. Ananya Rao (Faculty A)", designation: "Assistant Professor", dept: "ME", roles: [{ role: "FACULTY" }] },
  { key: "facultyB", email: "faculty.b@obe.local", name: "Prof. Rohan Verma (Faculty B)", designation: "Assistant Professor", dept: "ME", roles: [{ role: "FACULTY" }] },
  { key: "hodCse", email: "hod.cse@obe.local", name: "Dr. Farah Khan", designation: "Professor & HOD", dept: "CSE", roles: [{ role: "HOD", dept: "CSE" }, { role: "FACULTY" }] },
  { key: "reviewer", email: "reviewer@obe.local", name: "External Reviewer", designation: "Accreditation Reviewer", roles: [{ role: "REVIEWER" }] },
] as const;

const FIRST = ["Aarav", "Diya", "Kabir", "Isha", "Arjun", "Meera", "Vihaan", "Sara", "Aditya", "Anika", "Rohan", "Tara", "Kiran", "Nisha", "Dev", "Pooja", "Yash", "Riya", "Omkar", "Sneha"];
const LAST = ["Sharma", "Patil", "Nair", "Gupta", "Reddy", "Kulkarni", "Singh", "Das", "Joshi", "Mehta", "Iyer"];

export async function seed(connectionString: string, opts: { quiet?: boolean; students?: number } = {}) {
  const log = (m: string) => !opts.quiet && console.log(m);
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query("begin");
    const exists = await c.query("select 1 from institutions limit 1");
    if (exists.rowCount) {
      log("Database already seeded — skipping.");
      await c.query("rollback");
      return;
    }
    for (const [i, r] of ROLES.entries()) await c.query("insert into roles (code, name, rank) values ($1,$2,$3)", [r, ROLE_LABELS[r], i]);
    for (const [code, description] of Object.entries(PERMISSIONS)) await c.query("insert into permissions (code, description) values ($1,$2)", [code, description]);
    for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) await c.query("insert into role_permissions values ($1,$2)", [r, p]);

    const inst = (await c.query("insert into institutions (name, code, address) values ('Demo Institute of Technology','DIT','Pune, India') returning id")).rows[0].id;
    await c.query("insert into institution_settings (institution_id) values ($1)", [inst]);
    await c.query("insert into attainment_methodologies (institution_id, version, name, config) values ($1, 1, 'Institutional OBE methodology 2025', $2)", [inst, JSON.stringify(DEFAULT_METHODOLOGY)]);

    const soe = (await c.query("insert into schools (institution_id, name, code) values ($1,'School of Engineering','SOE') returning id", [inst])).rows[0].id;
    const depts: Record<string, string> = {};
    for (const [code, name] of [["ME", "Mechanical Engineering"], ["CSE", "Computer Science and Engineering"]]) {
      depts[code] = (await c.query("insert into departments (school_id, name, code) values ($1,$2,$3) returning id", [soe, name, code])).rows[0].id;
    }
    const ay = (await c.query("insert into academic_years (institution_id, name, start_date, end_date, is_current) values ($1,'2025-26','2025-07-01','2026-06-30',true) returning id", [inst])).rows[0].id;
    await c.query("insert into semesters (academic_year_id, name, term, start_date, end_date) values ($1,'Odd Semester','ODD','2025-07-15','2025-12-15'), ($1,'Even Semester','EVEN','2026-01-05','2026-05-30')", [ay]);
    const ay2 = (await c.query("insert into academic_years (institution_id, name, start_date, end_date) values ($1,'2026-27','2026-07-01','2027-06-30') returning id", [inst])).rows[0].id;
    await c.query("insert into semesters (academic_year_id, name, term) values ($1,'Odd Semester','ODD'), ($1,'Even Semester','EVEN')", [ay2]);
    const batchMe = (await c.query("insert into batches (institution_id, department_id, name, start_year, end_year) values ($1,$2,'2023-27',2023,2027) returning id", [inst, depts.ME])).rows[0].id;
    await c.query("insert into batches (institution_id, department_id, name, start_year, end_year) values ($1,$2,'2023-27',2023,2027)", [inst, depts.CSE]);

    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    for (const u of DEMO_USERS) {
      const dept = "dept" in u ? depts[u.dept] : null;
      const id = (await c.query("insert into users (institution_id, email, full_name, password_hash, designation, school_id, department_id) values ($1,$2,$3,$4,$5,$6,$7) returning id",
        [inst, u.email, u.name, hash, u.designation, dept ? soe : u.key === "dean" ? soe : null, dept])).rows[0].id;
      for (const r of u.roles) {
        const rr = r as { role: string; dept?: string; school?: string };
        await c.query("insert into user_roles (user_id, role_code, department_id, school_id) values ($1,$2,$3,$4)", [id, rr.role, rr.dept ? depts[rr.dept] : null, rr.school ? soe : null]);
      }
    }
    const n = opts.students ?? 60;
    for (let i = 1; i <= n; i++) {
      const roll = `ME23${String(i).padStart(3, "0")}`;
      const name = `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
      const email = `${roll.toLowerCase()}@students.obe.local`;
      const uid = (await c.query("insert into users (institution_id, email, full_name, password_hash, department_id, school_id) values ($1,$2,$3,$4,$5,$6) returning id", [inst, email, name, hash, depts.ME, soe])).rows[0].id;
      await c.query("insert into user_roles (user_id, role_code, department_id) values ($1,'STUDENT',$2)", [uid, depts.ME]);
      await c.query("insert into students (institution_id, user_id, roll_no, full_name, email, department_id, batch_id, section) values ($1,$2,$3,$4,$5,$6,$7,'A')", [inst, uid, roll, name, email, depts.ME, batchMe]);
    }
    await c.query("commit");
    log(`Seeded institution, 2 departments, ${DEMO_USERS.length} staff users and ${n} students. Demo password: ${DEMO_PASSWORD}`);
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  seed(url).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
