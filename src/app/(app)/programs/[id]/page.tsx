import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Target } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getProgram, listStaff } from "@/lib/services/academic";
import { AppError } from "@/lib/errors";
import { Card, CardBody, CardHeader, Empty, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { AssignProgramCoordinator, CreateCourseForm, OutcomeEditor, ProgramTargetsForm, RemovePcButton } from "@/components/forms/program-forms";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getProgram(user, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const { program, coordinators, pos, psos, courses } = data;
  const isHod = program.is_hod || user.roles.includes("SUPER_ADMIN");
  const canCourses = program.can_manage && can(user, "course.create");
  const staff = isHod ? await listStaff(user, program.department_id) : [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={program.department_name} title={`${program.code} · ${program.name}`} description={`${program.level} program · ${program.duration_years} years`}
        actions={<Link className={buttonVariants({ variant: "secondary" })} href={`/attainment/${program.id}`}><Target /> Program attainment</Link>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title="Program Coordinator" description="Owns courses, POs/PSOs and reviews course submissions." />
          <CardBody className="space-y-3">
            {coordinators.length === 0 ? <p className="text-sm text-amber-700">No Program Coordinator assigned.</p> : coordinators.map((c) => (
              <div key={c.user_id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 ring-1 ring-line">
                <div><div className="text-sm font-medium">{c.full_name}</div><div className="text-xs text-muted">{c.email}</div></div>
                {isHod && <RemovePcButton programId={program.id} userId={c.user_id} />}
              </div>
            ))}
            {isHod && <AssignProgramCoordinator programId={program.id} staff={staff} />}
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Program targets" description="Hierarchy: institution default → program → course → CO." />
          <CardBody>
            {program.can_manage ? <ProgramTargetsForm programId={program.id} co={program.default_co_target} po={program.default_po_target} />
              : <p className="text-sm text-ink-2">CO target: {program.default_co_target ?? "institution default"} · PO target: {program.default_po_target ?? "institution default"}</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Courses" description={canCourses ? "Create courses and assign Course Coordinators." : undefined} />
        <CardBody className="space-y-4">
          {canCourses && <CreateCourseForm programId={program.id} />}
          {courses.length === 0 ? <Empty icon={<BookOpen />} title="No courses yet" /> : (
            <Table>
              <thead><tr><Th>Code</Th><Th>Course</Th><Th>Sem</Th><Th>Credits (L-T-P)</Th><Th>Type</Th><Th>Course Coordinator</Th><Th>Offerings</Th><Th /></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-semibold text-violet-800">{c.code}</Td>
                    <Td>{c.name}</Td>
                    <Td className="tabular">{c.semester_number}</Td>
                    <Td className="tabular">{c.credits} ({c.lecture_hours}-{c.tutorial_hours}-{c.practical_hours})</Td>
                    <Td><Badge>{c.course_type}</Badge> <Badge tone="blue">{c.category}</Badge></Td>
                    <Td className="text-ink-2">{c.coordinators ?? <span className="text-amber-700">Not assigned</span>}</Td>
                    <Td className="tabular">{c.offering_count}</Td>
                    <Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/courses/${c.id}`}>{c.can_allocate ? "Allocate / manage" : "Open"}</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Program Outcomes (${pos.length})`} />
          <CardBody><OutcomeEditor programId={program.id} kind="PO" items={pos} canManage={program.can_manage} /></CardBody>
        </Card>
        <Card>
          <CardHeader title={`Program Specific Outcomes (${psos.length})`} />
          <CardBody><OutcomeEditor programId={program.id} kind="PSO" items={psos} canManage={program.can_manage} /></CardBody>
        </Card>
      </div>
    </div>
  );
}
