"use client";
import { Calculator } from "lucide-react";
import { calculateAttainmentAction } from "@/app/actions/workspace";
import { ActionButton } from "@/components/ui/action";

export function CalculateButton({ offeringId, label = "Calculate attainment" }: { offeringId: string; label?: string }) {
  return <ActionButton action={() => calculateAttainmentAction(offeringId)} successMessage="Attainment recalculated with the active methodology."><Calculator /> {label}</ActionButton>;
}
