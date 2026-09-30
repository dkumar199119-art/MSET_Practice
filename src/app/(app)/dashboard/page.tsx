import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BookOpen, ClipboardCheck, Layers, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can, hasRole } from "@/lib/rbac";
import { listMyCourses } from "@/lib/services/workspace";
import { offeringsOverview, summarize, institutionCounts } from "@/lib/services/dashboards";
import { getReviewQueue } from "@/lib/services/workflow";
import { listPrograms } from "@/lib/services/academic";
import { Card, CardBody, CardHeader, Empty, PageHeader, Stat, Table, Td, Th, Progress } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";
import { CourseCard } from "@/components/workspace/course-card";
import { CompletionMetrics } from "@/components/workspace/metrics";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requireUser();
  if (user.roles.length === 1 && hasRole(user, "STUDENT")) redirect("/student");

  const isFaculty = hasRole(user, "FACULTY", "COURSE_COORDINATOR") && user.scopes.assignedOfferings > 0;
  const isPc = user.scopes.pcPrograms.length > 0;
  const isHod = user.scopes.hodDepartments.length > 0;
  const isInst = can(user, "dashboard.institution");
  const my = isFaculty ? await listMyCourses(user) : [];
  const overview = isPc || isHod || isInst || hasRole(user, "DEAN", "COURSE_COORDINATOR") ? await offeringsOverview(user) : [];
  const queue = can(user, "course.review") ? await getReviewQueue(user) : null;
  const programs = isHod || isPc || isInst ? await listPrograms(user) : [];
  const counts = isInst || hasRole(user, "SUPER_ADMIN") ? await institutionCounts(user) : null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Welcome" title={user.fullName} description={user.designation ?? undefined} />

      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Schools" value={counts.schools} />
          <Stat label="Departments" value={counts.departments} />
          <Stat label="Programs" value={counts.programs} icon={<Layers />} />
          <Stat label="Courses" value={counts.courses} icon={<BookOpen />} />
          <Stat label="Faculty teaching" value={counts.faculty} icon={<Users />} />
          <Stat label="Students" value={counts.students} />
        </div>
      )}

      {queue && queue.rows.some((r) => r.my_stage) && (
        <Card>
          <CardHeader title="Awaiting your review" description="Courses at your review stage" action={<Link className={buttonVariants({ size: "sm", variant: "secondary" })} href="/reviews"><ClipboardCheck /> Review queue</Link>} />
          <CardBody>
            <Table>
              <thead><tr><Th>Course</Th><Th>Faculty</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {queue.rows.filter((r) => r.my_stage).map((r) => (
                  <tr key={r.id}>
                    <Td><span className="font-medium">{r.course_code}</span> {r.course_name}</Td>
                    <Td>{r.faculty}</Td>
                    <Td><WorkflowBadge status={r.status} stage={r.review_stage} /></Td>
                    <Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/workspace/${r.id}/submission`}>Review</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}

      {isFaculty && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">My Assigned Courses</h2>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{my.map((c) => <CourseCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {(isPc || isHod) && (
        <section className="space-y-4">
          {[...new Set([...user.scopes.pcPrograms, ...programs.filter((p) => user.scopes.hodDepartments.includes(p.department_id)).map((p) => p.id)])].map((pid) => {
            const p = programs.find((x) => x.id === pid);
            const rows = overview.filter((o) => o.program_id === pid);
            const s = summarize(rows);
            return (
              <Card key={pid}>
                <CardHeader title={`${p?.code ?? ""} ${p?.name ?? "Program"}`} description={`${s.courses} courses · ${s.offerings} offerings · ${s.pending} pending · ${s.returned} returned · ${s.approved} approved`}
                  action={<Link className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/programs/${pid}`}>Open program</Link>} />
                <CardBody className="space-y-4">
                  {rows.length ? <CompletionMetrics s={s} /> : <Empty title="No course offerings yet">Create courses and allocate faculty to start tracking completion.</Empty>}
                  {rows.length > 0 && (
                    <Table>
                      <thead><tr><Th>Course</Th><Th>Faculty</Th><Th>Setup</Th><Th>Status</Th><Th>Missing</Th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <Td><Link href={`/workspace/${r.id}`} className="font-medium text-violet-800 hover:underline">{r.course_code}</Link> <span className="text-ink-2">{r.course_name}</span> <span className="text-xs text-muted">§{r.section}</span></Td>
                            <Td className="text-ink-2">{r.faculty ?? "—"}</Td>
                            <Td className="w-40"><div className="flex items-center gap-2"><Progress value={r.completion} /><span className="tabular w-9 text-xs">{r.completion}%</span></div></Td>
                            <Td><WorkflowBadge status={r.status} stage={r.review_stage} /></Td>
                            <Td className="text-xs text-muted">{r.missing.slice(0, 3).join(", ")}{r.missing.length > 3 ? "…" : ""}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </section>
      )}

      {isInst && (
        <Card>
          <CardHeader title="Institution completion" description="Across all visible course offerings" action={<Link href="/iqac" className={buttonVariants({ size: "sm" })}>Open IQAC Command Center</Link>} />
          <CardBody>{overview.length ? <CompletionMetrics s={summarize(overview)} /> : <Empty title="No course offerings yet" />}</CardBody>
        </Card>
      )}

      {!isFaculty && !isPc && !isHod && !isInst && !counts && (
        <Empty icon={<AlertTriangle />} title="Nothing assigned yet">You will see courses here once they are allocated to you.</Empty>
      )}
    </div>
  );
}
