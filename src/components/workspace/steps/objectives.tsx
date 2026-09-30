import { getObjectives } from "@/lib/services/workspace";
import type { StepProps } from "./types";
import { ObjectivesEditor } from "./objectives-client";

export async function ObjectivesStep({ offeringId, user, readOnly }: StepProps) {
  const items = await getObjectives(user, offeringId);
  return <ObjectivesEditor offeringId={offeringId} readOnly={readOnly} initial={items} />;
}
