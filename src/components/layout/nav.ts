import type { CurrentUser, Permission } from "@/lib/rbac";
import { can, hasRole } from "@/lib/rbac";

export interface NavItem { href: string; label: string; icon: string; show: (u: CurrentUser) => boolean }
export interface NavGroup { label: string; items: NavItem[] }

const any = (...p: Permission[]) => (u: CurrentUser) => p.some((x) => can(u, x));

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", show: () => true }] },
  {
    label: "Academic Structure",
    items: [
      { href: "/admin/structure", label: "Institution & Calendar", icon: "Building2", show: any("institution.manage") },
      { href: "/programs", label: "Programs", icon: "Layers", show: any("program.create", "program.manage", "attainment.program", "dashboard.institution") },
    ],
  },
  {
    label: "Course Management",
    items: [{ href: "/courses", label: "Courses & Allocation", icon: "BookOpen", show: (u) => can(u, "course.create") || can(u, "course.allocate") || can(u, "dashboard.department") || can(u, "dashboard.institution") }],
  },
  {
    label: "Faculty Workspace",
    items: [{ href: "/my-courses", label: "My Assigned Courses", icon: "FolderOpen", show: (u) => hasRole(u, "FACULTY", "COURSE_COORDINATOR") }],
  },
  { label: "Student", items: [{ href: "/student", label: "My Courses & Feedback", icon: "MessageSquare", show: (u) => hasRole(u, "STUDENT") }] },
  { label: "Review", items: [{ href: "/reviews", label: "Review Queue", icon: "ClipboardCheck", show: any("course.review") }] },
  {
    label: "Attainment & Analysis",
    items: [
      { href: "/attainment", label: "Program Attainment", icon: "Target", show: any("attainment.program") },
      { href: "/iqac", label: "IQAC Command Center", icon: "Gauge", show: any("dashboard.institution", "dashboard.department") },
    ],
  },
  { label: "Reports", items: [{ href: "/reports", label: "Reports", icon: "FileText", show: any("reports.generate") }] },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users & Roles", icon: "UserCog", show: any("users.manage") },
      { href: "/admin/settings", label: "Settings & Methodology", icon: "Settings", show: any("methodology.manage") },
      { href: "/admin/audit", label: "Audit Logs", icon: "ScrollText", show: any("audit.view") },
    ],
  },
];
