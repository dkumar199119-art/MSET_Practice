import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { submissionChecklist } from "@/lib/domain/completion";
import { getWorkflowHistory } from "@/lib/services/workflow";
import { Card, CardBody, CardHeader, Table, Td, Th, Badge, Alert } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";
import { fmtDate, human } from "@/lib/utils";
import type { StepProps } from "./types";
import { RevisionDecision, RevisionRequest, ReviewPanel, SubmitPanel } from "./submission-client";

export async function SubmissionStep({ offeringId, user, ws }: StepProps) {
  const { ctx, progress } = ws;
  const checklist = submissionChecklist(progress);
  const ready = checklist.every((c) => c.done) && !progress.stale;
  const h = await getWorkflowHistory(user, offeringId);
  const awaiting = ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW"].includes(ctx.status);
  const isStageReviewer =
    awaiting &&
    ((ctx.review_stage === "COURSE_COORDINATOR" && user.scopes.ccCourses.includes(ctx.course_id)) ||
      (ctx.review_stage === "PROGRAM_COORDINATOR" && user.scopes.pcPrograms.includes(ctx.program_id)) ||
      (ctx.review_stage === "HOD" && user.scopes.hodDepartments.includes(ctx.department_id)) ||
      user.roles.includes("SUPER_ADMIN"));
  const pendingRevision = h.revisions.find((r) => r.status === "PENDING");
  const canDecideRevision = user.scopes.pcPrograms.includes(ctx.program_id) || user.scopes.hodDepartments.includes(ctx.department_id) || user.roles.includes("SUPER_ADMIN");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="21 · Submission & Review" description={`Workflow: Faculty → Course Coordinator → Program Coordinator${ws.settings.hod_approval_required ? " → HOD" : ""} → Approved & Locked.`} action={<WorkflowBadge status={ctx.status} stage={ctx.review_stage} />} />
        <CardBody className="space-y-4">
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {checklist.map((c) => (
              <li key={c.key}><Link href={`/workspace/${offeringId}/${c.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/70">
                {c.done ? <CheckCircle2 className="size-4 text-emerald-600" aria-label="complete" /> : <Circle className="size-4 text-muted" aria-label="incomplete" />}{c.label}</Link></li>
            ))}
          </ul>
          {progress.stale && <Alert tone="amber">Attainment is out of date — recalculate before submitting.</Alert>}
          {ctx.can_edit && ctx.editable && <SubmitPanel offeringId={offeringId} ready={ready} resubmit={ctx.status === "RETURNED"} />}
          {isStageReviewer && <ReviewPanel offeringId={offeringId} stage={ctx.review_stage!} />}
          {awaiting && !isStageReviewer && <Alert tone="blue">Awaiting review by the {human(ctx.review_stage)}.</Alert>}
          {ctx.status === "LOCKED" && ctx.can_edit && !pendingRevision && <RevisionRequest offeringId={offeringId} />}
          {pendingRevision && (
            <Alert tone="violet" title={`Revision requested by ${pendingRevision.requested_by_name}`}>
              <p>{pendingRevision.reason}</p>
              {canDecideRevision && <RevisionDecision offeringId={offeringId} requestId={pendingRevision.id} />}
            </Alert>
          )}
        </CardBody>
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Submission history" />
          <CardBody>
            <Table>
              <thead><tr><Th>When</Th><Th>Action</Th><Th>Status</Th><Th>By</Th><Th>Comments</Th></tr></thead>
              <tbody>
                {h.history.map((x) => (
                  <tr key={x.id}>
                    <Td className="text-xs text-muted whitespace-nowrap">{fmtDate(x.created_at)}</Td>
                    <Td><Badge tone={x.action === "RETURN" ? "amber" : x.action.startsWith("APPROVE") || x.action === "LOCK" ? "green" : "violet"}>{human(x.action)}</Badge>{x.stage && <span className="ml-1 text-[11px] text-muted">{human(x.stage)}</span>}</Td>
                    <Td className="text-xs">{human(x.from_status)} → {human(x.to_status)} <span className="text-muted">v{x.version}</span></Td>
                    <Td>{x.actor_name} <span className="text-[11px] text-muted">{human(x.actor_role)}</span></Td>
                    <Td className="text-ink-2">{x.comments}</Td>
                  </tr>
                ))}
                {h.history.length === 0 && <tr><Td colSpan={5} className="text-muted">No workflow events yet.</Td></tr>}
              </tbody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Versions" description="Approved versions are immutable snapshots." />
          <CardBody className="space-y-2">
            {h.versions.length === 0 ? <p className="text-sm text-muted">No approved version yet.</p> : h.versions.map((v) => (
              <div key={v.version} className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-line">
                <div className="text-sm font-medium">{v.label}</div>
                <div className="text-xs text-muted">Locked {fmtDate(v.created_at)} by {v.created_by_name}</div>
              </div>
            ))}
            {h.revisions.filter((r) => r.status !== "PENDING").map((r) => (
              <div key={r.id} className="text-xs text-ink-2">Revision {r.status.toLowerCase()} — {r.reason}{r.decision_comment ? ` (“${r.decision_comment}”)` : ""}</div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
