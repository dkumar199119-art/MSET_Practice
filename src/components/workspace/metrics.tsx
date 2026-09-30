import { Card, Progress } from "@/components/ui/primitives";
import type { summarize } from "@/lib/services/dashboards";

type S = ReturnType<typeof summarize>;

export function CompletionMetrics({ s }: { s: S }) {
  const items: [string, number][] = [
    ["Course setup completion", s.avgCompletion],
    ["CAM completion", s.camCompletion],
    ["Assessment completion", s.assessmentCompletion],
    ["Feedback completion", s.feedbackCompletion],
    ["Attainment completion", s.attainmentCompletion],
    ["Faculty submission", s.submissionRate],
    ["Approval completion", s.approvalRate],
    ["Evidence completion", s.evidenceCompletion],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, v]) => (
        <Card key={label} className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted">{label}</span>
            <span className="text-lg font-semibold text-ink">{v}%</span>
          </div>
          <Progress className="mt-2" value={v} tone={v === 100 ? "green" : "violet"} />
        </Card>
      ))}
    </div>
  );
}
