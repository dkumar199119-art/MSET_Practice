"use client";
import { useState } from "react";
import { Check, RotateCcw, Send } from "lucide-react";
import { decideRevisionAction, requestRevisionAction, reviewCourseAction, submitCourseAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Field, Textarea } from "@/components/ui/primitives";
import { human } from "@/lib/utils";

export function SubmitPanel({ offeringId, ready, resubmit }: { offeringId: string; ready: boolean; resubmit: boolean }) {
  const [comment, setComment] = useState("");
  const { run, pending, result } = useServerAction(submitCourseAction);
  return (
    <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
      <Field label={resubmit ? "Response to reviewer comments" : "Note to reviewers (optional)"}><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="mt-2 flex items-center gap-3">
        <Button disabled={!ready || pending} onClick={() => void run(offeringId, comment || undefined)}><Send /> {resubmit ? "Resubmit Course for Review" : "Submit Course for Review"}</Button>
        {!ready && <span className="text-xs text-muted">Complete every checklist item to enable submission.</span>}
        <ResultMessage result={result} />
      </div>
    </div>
  );
}

export function ReviewPanel({ offeringId, stage }: { offeringId: string; stage: string }) {
  const [comment, setComment] = useState("");
  const { run, pending, result } = useServerAction(reviewCourseAction);
  return (
    <div className="rounded-xl border border-violet-200 bg-lavender-50/70 p-3">
      <div className="mb-2 text-sm font-medium text-violet-900">Your review ({human(stage)} stage)</div>
      <p className="mb-2 text-xs text-ink-2">Review every step via the stepper (calculations, AI analysis, evidence) before deciding.</p>
      <Field label="Comments (required when returning)"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="success" disabled={pending} onClick={() => void run({ offeringId, decision: "APPROVE", comment: comment || null })}><Check /> Approve</Button>
        <Button variant="secondary" disabled={pending || comment.trim().length < 5} onClick={() => void run({ offeringId, decision: "RETURN", comment })}><RotateCcw /> Return for correction</Button>
        <ResultMessage result={result} />
      </div>
    </div>
  );
}

export function RevisionRequest({ offeringId }: { offeringId: string }) {
  const [reason, setReason] = useState("");
  const { run, pending, result } = useServerAction(requestRevisionAction);
  return (
    <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
      <Field label="Request Revision — reason (required)" hint="The Program Coordinator or HOD must approve. The approved version stays preserved; a new version is opened."><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="mt-2 flex items-center gap-3"><Button variant="secondary" disabled={pending || reason.trim().length < 10} onClick={() => void run(offeringId, reason)}>Request Revision</Button><ResultMessage result={result} /></div>
    </div>
  );
}

export function RevisionDecision({ offeringId, requestId }: { offeringId: string; requestId: string }) {
  const [comment, setComment] = useState("");
  const { run, pending, result } = useServerAction(decideRevisionAction);
  return (
    <div className="mt-2 space-y-2">
      <Textarea rows={2} placeholder="Decision comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="success" disabled={pending} onClick={() => void run(offeringId, requestId, true, comment)}>Approve revision</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => void run(offeringId, requestId, false, comment)}>Reject</Button>
        <ResultMessage result={result} />
      </div>
    </div>
  );
}
