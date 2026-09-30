import { getAssessments, getEnrollment } from "@/lib/services/workspace";
import { Empty } from "@/components/ui/primitives";
import type { StepProps } from "./types";
import { AssessmentsEditor, QuestionMappingEditor } from "./assessments-client";
import { StudentsPanel } from "./students-client";

export async function AssessmentsStep({ offeringId, user, readOnly }: StepProps) {
  const d = await getAssessments(user, offeringId);
  if (!d.cos.length) return <Empty title="Define course outcomes first" />;
  return <AssessmentsEditor offeringId={offeringId} readOnly={readOnly} data={d} />;
}
export async function QuestionMappingStep({ offeringId, user, readOnly }: StepProps) {
  const d = await getAssessments(user, offeringId);
  if (!d.assessments.length) return <Empty title="Define the assessment structure first" />;
  return <QuestionMappingEditor offeringId={offeringId} readOnly={readOnly} data={d} />;
}
export async function StudentsStep({ offeringId, user, readOnly, ws }: StepProps) {
  const rows = await getEnrollment(user, offeringId);
  return <StudentsPanel offeringId={offeringId} readOnly={readOnly} rows={rows} batch={ws.ctx.batch} section={ws.ctx.section} />;
}
