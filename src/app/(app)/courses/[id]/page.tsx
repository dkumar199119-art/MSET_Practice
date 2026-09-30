import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import { getCourse, listCalendar, listStaff } from "@/lib/services/academic";
import { Card, CardBody, CardHeader, Empty, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";
import { AllocateFacultyForm, AssignCourseCoordinator, RemoveAssignmentButton, RemoveCcButton } from "@/components/forms/course-forms";
import { human } from "@/lib/utils";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { course, coordinators, offerings } = await getCourse(user, id).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const canAssignCc = course.can_manage && can(user, "course.assign_coordinator");
  const canAllocate = course.can_allocate;
  const staff = canAssignCc || canAllocate ? await listStaff(user, course.department_id) : [];
  const cal = canAllocate ? await listCalendar(user) : null;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={<Link href={`/programs/${course.program_id}`} className="hover:underline">{course.program_code} · {course.program_name}</Link>} title={`${course.code} · ${course.name}`}
        description={`Semester ${course.semester_number} · ${course.credits} credits (L-T-P ${course.lecture_hours}-${course.tutorial_hours}-${course.practical_hours}) · ${human(course.course_type)} · ${course.category}`} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Course Coordinator" description="Coordinates course configuration and allocates faculty." />
          <CardBody className="space-y-3">
            {coordinators.length === 0 ? <p className="text-sm text-amber-700">No Course Coordinator assigned.</p> : coordinators.map((c) => (
              <div key={c.user_id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 ring-1 ring-line">
                <span className="text-sm font-medium">{c.full_name}</span>
                {canAssignCc && <RemoveCcButton courseId={course.id} userId={c.user_id} />}
              </div>
            ))}
            {canAssignCc && <AssignCourseCoordinator courseId={course.id} staff={staff} />}
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Allocate Faculty" description="Creates (or reuses) the course offering for the selected year, semester, batch and section, then assigns the faculty role." />
          <CardBody>
            {canAllocate && cal ? <AllocateFacultyForm courseId={course.id} staff={staff} years={cal.years} semesters={cal.semesters} batches={cal.batches} departmentId={course.department_id} />
              : <p className="text-sm text-muted">Only the Course Coordinator or Program Coordinator can allocate faculty.</p>}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Course offerings & faculty" />
        <CardBody>
          {offerings.length === 0 ? <Empty title="Not offered yet">Allocate faculty to create the first offering.</Empty> : (
            <Table>
              <thead><tr><Th>Academic year</Th><Th>Semester</Th><Th>Batch / Section</Th><Th>Faculty</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {offerings.map((o) => (
                  <tr key={o.id}>
                    <Td>{o.academic_year}</Td>
                    <Td>{o.semester}</Td>
                    <Td>{o.batch} / {o.section}</Td>
                    <Td>
                      <div className="space-y-1">
                        {o.faculty.map((f) => (
                          <div key={f.assignment_id} className="flex items-center gap-2">
                            <span>{f.full_name}</span><Badge tone="violet">{human(f.course_role)}</Badge>
                            {canAllocate && <RemoveAssignmentButton courseId={course.id} assignmentId={f.assignment_id} />}
                          </div>
                        ))}
                      </div>
                    </Td>
                    <Td><WorkflowBadge status={o.status} /></Td>
                    <Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/workspace/${o.id}`}>Workspace</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
