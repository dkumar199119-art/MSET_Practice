import { FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listMyCourses } from "@/lib/services/workspace";
import { Empty, PageHeader } from "@/components/ui/primitives";
import { CourseCard } from "@/components/workspace/course-card";

export const metadata = { title: "My Assigned Courses" };

export default async function MyCourses() {
  const user = await requireUser();
  const courses = await listMyCourses(user);
  return (
    <div>
      <PageHeader eyebrow="Faculty Workspace" title="My Assigned Courses" description="Courses allocated to you by the Course or Program Coordinator. Complete the guided setup for each." />
      {courses.length === 0 ? (
        <Empty icon={<FolderOpen />} title="No courses assigned">When a coordinator allocates a course to you, it appears here and you receive a notification.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{courses.map((c) => <CourseCard key={c.id} c={c} />)}</div>
      )}
    </div>
  );
}
