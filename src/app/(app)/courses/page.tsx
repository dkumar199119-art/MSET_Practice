import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listCourses } from "@/lib/services/academic";
import { Card, CardBody, Empty, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const user = await requireUser();
  const courses = await listCourses(user);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Course Management" title="Courses & Allocation" description="Courses are created by the Program Coordinator inside a program. Course Coordinators allocate faculty per academic year, semester, batch and section." />
      <Card>
        <CardBody>
          {courses.length === 0 ? <Empty icon={<BookOpen />} title="No courses visible to you" /> : (
            <Table>
              <thead><tr><Th>Program</Th><Th>Code</Th><Th>Course</Th><Th>Sem</Th><Th>Credits</Th><Th>Course Coordinator</Th><Th>Offerings</Th><Th /></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <Td><Badge tone="violet">{c.program_code}</Badge></Td>
                    <Td className="font-semibold text-violet-800">{c.code}</Td>
                    <Td>{c.name}</Td>
                    <Td className="tabular">{c.semester_number}</Td>
                    <Td className="tabular">{c.credits}</Td>
                    <Td className="text-ink-2">{c.coordinators ?? <span className="text-amber-700">Not assigned</span>}</Td>
                    <Td className="tabular">{c.offering_count}</Td>
                    <Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/courses/${c.id}`}>{c.can_allocate ? "Allocate Faculty" : "Open"}</Link></Td>
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
