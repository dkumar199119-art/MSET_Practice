import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/services/workspace";
import { WIZARD_STEPS } from "@/lib/domain/completion";
import { STEP_COMPONENTS } from "@/components/workspace/steps";

export default async function StepPage({ params }: { params: Promise<{ offeringId: string; step: string }> }) {
  const { offeringId, step } = await params;
  const Step = STEP_COMPONENTS[step];
  if (!Step || !WIZARD_STEPS.some((s) => s.slug === step)) notFound();
  const user = await requireUser();
  const w = await getWorkspace(user, offeringId);
  const readOnly = !w.ctx.can_edit || !w.ctx.editable;
  return <Step offeringId={offeringId} user={user} ws={w} readOnly={readOnly} />;
}
