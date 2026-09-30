import { getCourseAttainment } from "@/lib/services/attainment";
import { getGapInsights } from "@/lib/services/ai";
import { listActionPlans } from "@/lib/services/action-plans";
import { Card, CardBody, CardHeader, Empty, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { GapBadge } from "@/components/ui/status";
import { fmtGap, fmtPct, human } from "@/lib/utils";
import type { StepProps } from "./types";
import { GapsPlanner, ActionPlanStatus } from "./gaps-client";

export async function GapsStep({ offeringId, user, readOnly, ws }: StepProps) {
  const att = await getCourseAttainment(user, offeringId);
  const insights = await getGapInsights(user, offeringId);
  const plans = await listActionPlans(user, offeringId);
  const canPlan = ws.ctx.can_edit || ws.ctx.can_review;
  const needPlan = att.gaps.filter((g) => ["BELOW_TARGET", "CRITICAL"].includes(g.classification));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="18 · Gap Analysis" description={`Gap = actual − target. Classification thresholds are configured in the methodology.${ws.settings.require_action_plan_for_gaps ? " Every Below-target or Critical gap needs an action plan before submission." : ""}`} />
        <CardBody>
          {att.gaps.length === 0 ? <Empty title="Calculate course attainment first" /> : (
            <Table>
              <thead><tr><Th>Level</Th><Th>Entity</Th><Th>Target</Th><Th>Actual</Th><Th>Gap</Th><Th>Classification</Th><Th>Action plan</Th></tr></thead>
              <tbody>
                {att.gaps.map((g) => {
                  const has = plans.some((p) => p.level === g.level && p.entity_code === g.entity_code);
                  return (
                    <tr key={g.id}>
                      <Td><Badge>{g.level}</Badge></Td>
                      <Td className="font-semibold">{g.entity_code}</Td>
                      <Td className="tabular">{fmtPct(g.target, 0)}</Td>
                      <Td className="tabular">{fmtPct(g.actual)}</Td>
                      <Td className="tabular">{fmtGap(g.gap)}</Td>
                      <Td><GapBadge status={g.classification} /></Td>
                      <Td>{has ? <Badge tone="green">recorded</Badge> : ["BELOW_TARGET", "CRITICAL"].includes(g.classification) ? <Badge tone="amber">required</Badge> : <span className="text-xs text-muted">—</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Detected patterns" description="Deterministic checks on aggregated results (not AI)." />
        <CardBody>
          {insights.patterns.length === 0 ? <p className="text-sm text-muted">No notable patterns detected.</p> : (
            <ul className="space-y-1.5 text-sm">{insights.patterns.map((p, i) => <li key={i} className="flex gap-2"><Badge tone={p.severity === "critical" ? "red" : p.severity === "warning" ? "amber" : "blue"}>{human(p.kind)}</Badge><span>{p.message}</span></li>)}</ul>
          )}
        </CardBody>
      </Card>

      <GapsPlanner offeringId={offeringId} canPlan={canPlan} showAi={att.final.length > 0}
        gaps={att.gaps.map((g) => ({ id: g.id, level: g.level, code: g.entity_code, classification: g.classification }))} />

      <Card>
        <CardHeader title="Corrective action plans" description={`${needPlan.length} gap(s) below target.`} />
        <CardBody className="space-y-4">
          {plans.length === 0 ? <p className="text-sm text-muted">No action plans yet.</p> : (
            <Table>
              <thead><tr><Th>Entity</Th><Th>Root cause</Th><Th>Corrective action</Th><Th>Responsible</Th><Th>Target date</Th><Th>Status</Th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <Td><Badge>{p.level}</Badge> <b>{p.entity_code}</b>{p.source !== "MANUAL" && <Badge tone="violet" className="ml-1">AI-assisted</Badge>}</Td>
                    <Td className="text-ink-2">{p.root_cause}</Td>
                    <Td className="text-ink-2">{p.corrective_action}</Td>
                    <Td>{p.responsible_name ?? "—"}</Td>
                    <Td className="tabular">{p.target_date ?? "—"}</Td>
                    <Td>{canPlan ? <ActionPlanStatus offeringId={offeringId} id={p.id} status={p.status} /> : <Badge>{human(p.status)}</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {readOnly && canPlan && <p className="text-xs text-muted">Action plans remain editable after locking — continuous improvement continues into the next offering.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
