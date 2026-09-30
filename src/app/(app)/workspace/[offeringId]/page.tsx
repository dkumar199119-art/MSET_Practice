import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/services/workspace";
import { submissionChecklist, WEIGHT_LABELS } from "@/lib/domain/completion";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";

export default async function Overview({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  const user = await requireUser();
  const { completion, progress, settings } = await getWorkspace(user, offeringId);
  const checklist = submissionChecklist(progress);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="What is missing" description={`Course completion ${completion.percent}% — weights are configured by IQAC.`} />
        <CardBody className="space-y-2">
          {completion.missing.length === 0 ? <p className="text-sm text-emerald-700">All weighted setup items are complete.</p> : completion.missing.map((m) => (
            <div key={m.key} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 ring-1 ring-line">
              <span className="text-sm">{m.label} <span className="text-xs text-muted">({settings.completion_weights[m.key]}%)</span></span>
              <Link href={`/workspace/${offeringId}/${m.slug}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Complete Now <ArrowRight /></Link>
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Submission checklist" description="All items must be complete before the course can be submitted for review." />
        <CardBody>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.key}>
                <Link href={`/workspace/${offeringId}/${c.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/70">
                  {c.done ? <CheckCircle2 className="size-4 text-emerald-600" aria-label="done" /> : <Circle className="size-4 text-muted" aria-label="pending" />}
                  <span className={c.done ? "text-ink" : "text-ink-2"}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Weighted items: {Object.keys(settings.completion_weights).map((k) => WEIGHT_LABELS[k] ?? k).join(", ")}.</p>
        </CardBody>
      </Card>
    </div>
  );
}
