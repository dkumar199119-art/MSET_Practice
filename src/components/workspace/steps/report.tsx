import { Card, CardBody, CardHeader, Alert } from "@/components/ui/primitives";
import { REPORT_TYPES } from "@/lib/reports/datasets";
import { ReportLinks } from "@/components/reports/report-links";
import type { StepProps } from "./types";

export async function ReportStep({ offeringId, ws }: StepProps) {
  const ready = ws.progress.final;
  return (
    <Card>
      <CardHeader title="20 · Course Report" description="Accreditation-ready course reports with formulas, methodology version and calculation date." />
      <CardBody className="space-y-3">
        {!ready && <Alert tone="amber">Reports become available once final course attainment is calculated.</Alert>}
        {(["COURSE_ATTAINMENT", "COURSE_PO_PSO", "COURSE_GAP"] as const).map((t) => (
          <div key={t} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-line">
            <div className="text-sm font-medium">{REPORT_TYPES[t]}{t === "COURSE_ATTAINMENT" && <span className="ml-2 text-xs text-muted">profile, COs, CO-PO/PSO matrices, assessment mapping, direct, indirect, final, PO/PSO, gaps, action plans</span>}</div>
            {ready && <ReportLinks query={{ type: t, offeringId }} />}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
