import Link from "next/link";
import { ArrowRight, CalendarRange } from "lucide-react";
import { Card, Progress, Badge } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { human } from "@/lib/utils";

export interface CourseCardData {
  id: string; course_code: string; course_name: string; program_code: string; semester: string; academic_year: string; section: string;
  course_role: string; status: string; deadline: string | null; attainment_status: string; completion: { percent: number; missing: { label: string; slug: string }[] };
}

export function CourseCard({ c }: { c: CourseCardData }) {
  const pct = c.completion.percent;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-violet-700">{c.course_code}</div>
          <div className="mt-0.5 font-semibold text-ink">{c.course_name}</div>
          <div className="mt-1 text-xs text-muted">
            {c.program_code} · {c.semester} {c.academic_year} · Section {c.section}
          </div>
        </div>
        <WorkflowBadge status={c.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {c.course_role.split(", ").map((r) => <Badge key={r} tone="violet">{human(r)}</Badge>)}
        <Badge tone={c.attainment_status === "Calculated" ? "green" : "neutral"}>Attainment: {c.attainment_status}</Badge>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs"><span className="text-ink-2">Course setup</span><span className="font-semibold text-ink">{pct}%</span></div>
        <Progress value={pct} tone={pct === 100 ? "green" : "violet"} />
        {c.completion.missing.length > 0 && (
          <div className="mt-2 text-xs text-muted">Missing: {c.completion.missing.slice(0, 4).map((m) => m.label).join(", ")}{c.completion.missing.length > 4 ? "…" : ""}</div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted"><CalendarRange className="size-3.5" /> {c.deadline ? `Due ${c.deadline}` : "No deadline"}</span>
        <Link href={`/workspace/${c.id}`} className={buttonVariants({ size: "sm" })}>
          {pct === 0 ? "Start Course Setup" : c.status === "DRAFT" || c.status === "RETURNED" ? "Continue Course Setup" : "Open Workspace"} <ArrowRight />
        </Link>
      </div>
    </Card>
  );
}
