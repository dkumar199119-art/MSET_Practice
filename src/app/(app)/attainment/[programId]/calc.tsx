"use client";
import { Calculator } from "lucide-react";
import { calculateProgramAttainmentAction } from "@/app/actions/misc";
import { ActionButton } from "@/components/ui/action";

export function ProgramCalcButton({ programId, academicYearId }: { programId: string; academicYearId: string }) {
  return <ActionButton size="sm" action={() => calculateProgramAttainmentAction(programId, academicYearId)} successMessage="Program attainment recalculated"><Calculator /> Calculate program attainment</ActionButton>;
}
