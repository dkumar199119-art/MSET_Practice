import { getMatrix } from "@/lib/services/workspace";
import { Empty } from "@/components/ui/primitives";
import type { StepProps } from "./types";
import { MatrixEditor } from "./matrix-client";

export function matrixStep(kind: "PO" | "PSO") {
  return async function MatrixStep({ offeringId, user, readOnly }: StepProps) {
    const m = await getMatrix(user, offeringId, kind);
    if (!m.cos.length) return <Empty title="Define course outcomes first" />;
    if (!m.outcomes.length) return <Empty title={`The program has no ${kind}s defined`}>Ask the Program Coordinator to add {kind}s on the program page.</Empty>;
    return <MatrixEditor offeringId={offeringId} kind={kind} readOnly={readOnly} data={m} />;
  };
}
