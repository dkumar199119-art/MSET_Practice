import { AlertTriangle, CheckCircle2, CircleDot, Lock, Send, RotateCcw, Pencil, Eye, XCircle, MinusCircle } from "lucide-react";
import { Badge, type BadgeTone } from "./primitives";

const GAP: Record<string, { tone: BadgeTone; label: string; Icon: typeof CheckCircle2 }> = {
  ACHIEVED: { tone: "green", label: "Achieved", Icon: CheckCircle2 },
  NEAR_TARGET: { tone: "amber", label: "Near target", Icon: CircleDot },
  BELOW_TARGET: { tone: "orange", label: "Below target", Icon: AlertTriangle },
  CRITICAL: { tone: "red", label: "Critical", Icon: XCircle },
  INCOMPLETE: { tone: "neutral", label: "Incomplete", Icon: MinusCircle },
};

/** Gap/attainment status: always icon + label, never colour alone. */
export function GapBadge({ status }: { status: string }) {
  const s = GAP[status] ?? GAP.INCOMPLETE;
  return (
    <Badge tone={s.tone}>
      <s.Icon className="size-3" aria-hidden /> {s.label}
    </Badge>
  );
}

const WF: Record<string, { tone: BadgeTone; label: string; Icon: typeof CheckCircle2 }> = {
  DRAFT: { tone: "neutral", label: "Draft", Icon: Pencil },
  SUBMITTED: { tone: "blue", label: "Submitted", Icon: Send },
  UNDER_REVIEW: { tone: "violet", label: "Under review", Icon: Eye },
  RETURNED: { tone: "amber", label: "Returned", Icon: RotateCcw },
  RESUBMITTED: { tone: "blue", label: "Resubmitted", Icon: Send },
  APPROVED: { tone: "green", label: "Approved", Icon: CheckCircle2 },
  LOCKED: { tone: "green", label: "Approved · Locked", Icon: Lock },
};
export function WorkflowBadge({ status, stage }: { status: string; stage?: string | null }) {
  const s = WF[status] ?? WF.DRAFT;
  return (
    <Badge tone={s.tone}>
      <s.Icon className="size-3" aria-hidden /> {s.label}
      {stage ? <span className="opacity-70">· {stage.replace(/_/g, " ").toLowerCase()}</span> : null}
    </Badge>
  );
}
