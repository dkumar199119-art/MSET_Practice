import { getOutcomes } from "@/lib/services/workspace";
import type { StepProps } from "./types";
import { OutcomesEditor } from "./outcomes-client";
import { BloomEditor } from "./bloom-client";
import { TargetsEditor } from "./targets-client";

export async function OutcomesStep({ offeringId, user, readOnly }: StepProps) {
  const d = await getOutcomes(user, offeringId);
  return <OutcomesEditor offeringId={offeringId} readOnly={readOnly} initial={d.cos} />;
}
export async function BloomStep({ offeringId, user, readOnly }: StepProps) {
  const d = await getOutcomes(user, offeringId);
  return <BloomEditor offeringId={offeringId} readOnly={readOnly} cos={d.cos} />;
}
export async function TargetsStep({ offeringId, user, readOnly }: StepProps) {
  const d = await getOutcomes(user, offeringId);
  return <TargetsEditor offeringId={offeringId} readOnly={readOnly} cos={d.cos} targets={d.targets} />;
}
