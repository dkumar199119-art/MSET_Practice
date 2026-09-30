import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getWorkspace } from "@/lib/services/workspace";
import { WIZARD_STEPS } from "@/lib/domain/completion";
import { Stepper } from "@/components/workspace/stepper";
import { Card, Progress, Alert } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  const user = await requireUser();
  const w = await getWorkspace(user, offeringId).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const { ctx, progress, completion } = w;
  const steps = WIZARD_STEPS.map((s) => ({ slug: s.slug, label: s.label, done: s.progressKey ? !!progress[s.progressKey] : null }));
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-violet-700">
              <Link href={`/programs/${ctx.program_id}`} className="hover:underline">{ctx.program_code}</Link> · {ctx.academic_year} · {ctx.semester} · Batch {ctx.batch} · Section {ctx.section}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-ink">{ctx.course_code} · {ctx.course_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <WorkflowBadge status={ctx.status} stage={ctx.review_stage} />
              <span className="text-xs text-muted">Version {ctx.version} · Faculty: {ctx.faculty.map((f) => f.full_name).join(", ") || "—"}</span>
            </div>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-1 flex items-baseline justify-between"><span className="text-xs font-medium text-ink-2">Course Setup Completion</span><span className="text-2xl font-semibold text-ink">{completion.percent}%</span></div>
            <Progress value={completion.percent} tone={completion.percent === 100 ? "green" : "violet"} />
          </div>
        </div>
        {!ctx.editable && (
          <Alert tone="blue" className="mt-4" title={<span className="flex items-center gap-1.5"><Lock className="size-4" /> Academic data is read-only ({ctx.status.replace("_", " ").toLowerCase()})</span>}>
            {ctx.status === "LOCKED" ? "This version is approved and locked. Use “Request Revision” on the Submission step to open a new version." : "The course is under review. Editing reopens only if it is returned."}
          </Alert>
        )}
        {ctx.editable && !ctx.can_edit && <Alert tone="violet" className="mt-4">You are viewing this course as a reviewer. Only assigned faculty can edit.</Alert>}
        {progress.stale && <Alert tone="amber" className="mt-4" title="Attainment is out of date">Marks, mappings or feedback changed after the last calculation. Recalculate on the Direct Attainment step.</Alert>}
      </Card>
      <div className="flex flex-col gap-4 xl:flex-row">
        <aside className="glass h-fit shrink-0 rounded-2xl p-2 xl:sticky xl:top-20 xl:w-60"><Stepper base={`/workspace/${offeringId}`} steps={steps} /></aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
