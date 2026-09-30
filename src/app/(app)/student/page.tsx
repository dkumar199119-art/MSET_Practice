import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listStudentCourses } from "@/lib/services/feedback";
import { Card, CardBody, Empty, PageHeader, Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "My Courses" };

export default async function StudentHome() {
  const user = await requireUser();
  const courses = await listStudentCourses(user);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Student" title="My Courses & Feedback" description="Complete the course outcome feedback for each enrolled course. Responses are anonymous and can be submitted once." />
      {courses.length === 0 ? <Empty icon={<MessageSquare />} title="No enrolled courses" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.offering_id}>
              <CardBody>
                <div className="text-xs font-semibold text-violet-700">{c.course_code}</div>
                <div className="font-semibold">{c.course_name}</div>
                <div className="mt-1 text-xs text-muted">{c.semester} {c.academic_year} · Section {c.section} · {c.faculty}</div>
                <div className="mt-3 flex items-center justify-between">
                  {c.submitted ? <Badge tone="green">Feedback submitted</Badge> : c.feedback_status === "OPEN" ? <Badge tone="amber">Feedback pending</Badge> : <Badge>Feedback not open</Badge>}
                  {c.feedback_status === "OPEN" && !c.submitted && <Link className={buttonVariants({ size: "sm" })} href={`/student/feedback/${c.offering_id}`}>Give feedback</Link>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
