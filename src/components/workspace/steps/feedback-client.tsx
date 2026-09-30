"use client";
import { Send, Square } from "lucide-react";
import { closeFeedbackAction, publishFeedbackAction } from "@/app/actions/workspace";
import { ActionButton } from "@/components/ui/action";

export function FeedbackControls({ offeringId, status, hasCos }: { offeringId: string; status: string | null; hasCos: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "OPEN" && (
        <ActionButton disabled={!hasCos} action={() => publishFeedbackAction(offeringId)}><Send /> {status === "CLOSED" ? "Re-open feedback" : "Generate & publish feedback form"}</ActionButton>
      )}
      {status === "OPEN" && <ActionButton variant="secondary" confirm="Close the feedback window?" action={() => closeFeedbackAction(offeringId)}><Square /> Close feedback</ActionButton>}
    </div>
  );
}
