/**
 * Role & permission matrix. Coarse permission checks here decide navigation
 * and fail fast in services; *scope* (which department/program/course) is
 * always enforced by PostgreSQL row level security (db/migrations/003_rls.sql).
 */

export const ROLES = [
  "SUPER_ADMIN",
  "IQAC_ADMIN",
  "DIRECTOR",
  "DEAN",
  "HOD",
  "PROGRAM_COORDINATOR",
  "COURSE_COORDINATOR",
  "FACULTY",
  "STUDENT",
  "REVIEWER",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  IQAC_ADMIN: "IQAC Admin",
  DIRECTOR: "Director",
  DEAN: "Dean",
  HOD: "Head of Department",
  PROGRAM_COORDINATOR: "Program Coordinator",
  COURSE_COORDINATOR: "Course Coordinator",
  FACULTY: "Faculty",
  STUDENT: "Student",
  REVIEWER: "Reviewer",
};

export const PERMISSIONS = {
  "institution.manage": "Manage institution, schools, departments, academic calendar",
  "users.manage": "Manage users and role assignments",
  "settings.manage": "Manage system settings and AI configuration",
  "methodology.manage": "Configure institutional attainment methodology and targets",
  "program.create": "Create programs within own department",
  "program.assign_coordinator": "Assign program coordinators",
  "program.manage": "Manage program outcomes, PSOs and program targets",
  "course.create": "Create courses within a managed program",
  "course.assign_coordinator": "Assign course coordinators",
  "course.allocate": "Allocate faculty to course offerings",
  "course.workspace": "Complete the course workspace of assigned courses",
  "marks.edit": "Upload and edit marks of assigned courses",
  "course.review": "Review, return and approve course submissions",
  "attainment.program": "Calculate and view program attainment",
  "dashboard.department": "View department analytics",
  "dashboard.institution": "View institution-wide IQAC command center",
  "reports.generate": "Generate attainment reports",
  "audit.view": "View audit logs",
  "feedback.submit": "Submit course feedback",
  "ai.use": "Use AI assistance",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "institution.manage", "users.manage", "settings.manage", "methodology.manage", "program.create",
    "program.assign_coordinator", "program.manage", "course.create", "course.assign_coordinator", "course.allocate",
    "course.review", "attainment.program", "dashboard.department", "dashboard.institution", "reports.generate",
    "audit.view", "ai.use",
  ],
  IQAC_ADMIN: ["methodology.manage", "attainment.program", "dashboard.department", "dashboard.institution", "reports.generate", "audit.view", "ai.use"],
  DIRECTOR: ["attainment.program", "dashboard.department", "dashboard.institution", "reports.generate"],
  DEAN: ["attainment.program", "dashboard.department", "reports.generate"],
  HOD: [
    "program.create", "program.assign_coordinator", "program.manage", "course.create", "course.assign_coordinator",
    "course.review", "attainment.program", "dashboard.department", "reports.generate", "ai.use",
  ],
  PROGRAM_COORDINATOR: [
    "program.manage", "course.create", "course.assign_coordinator", "course.allocate", "course.review",
    "attainment.program", "reports.generate", "ai.use",
  ],
  COURSE_COORDINATOR: ["course.allocate", "course.workspace", "marks.edit", "course.review", "reports.generate", "ai.use"],
  FACULTY: ["course.workspace", "marks.edit", "reports.generate", "ai.use"],
  STUDENT: ["feedback.submit"],
  REVIEWER: ["dashboard.institution", "attainment.program", "reports.generate"],
};

export interface UserScopes {
  hodDepartments: string[];
  deanSchools: string[];
  pcPrograms: string[];
  ccCourses: string[];
  assignedOfferings: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  designation: string | null;
  departmentId: string | null;
  roles: Role[];
  scopes: UserScopes;
  studentId: string | null;
}

export function hasRole(user: Pick<CurrentUser, "roles">, ...roles: Role[]) {
  return roles.some((r) => user.roles.includes(r));
}

export function can(user: Pick<CurrentUser, "roles">, permission: Permission) {
  return user.roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
}

/** The most senior role, used as default "acting role" in the audit trail. */
export function primaryRole(user: Pick<CurrentUser, "roles">): Role {
  for (const r of ROLES) if (user.roles.includes(r)) return r;
  return "FACULTY";
}
