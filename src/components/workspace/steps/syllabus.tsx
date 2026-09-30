import { getSyllabus } from "@/lib/services/workspace";
import type { StepProps } from "./types";
import { SyllabusEditor } from "./syllabus-client";

export async function SyllabusStep({ offeringId, user, readOnly }: StepProps) {
  const s = await getSyllabus(user, offeringId);
  return <SyllabusEditor offeringId={offeringId} readOnly={readOnly} initial={s} />;
}
