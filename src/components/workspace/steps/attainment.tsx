import { Calculator } from "lucide-react";
import { getCourseAttainment } from "@/lib/services/attainment";
import { getFeedbackStatus } from "@/lib/services/feedback";
import { Card, CardBody, CardHeader, Empty, Table, Td, Th, Progress, Alert, Badge } from "@/components/ui/primitives";
import { GapBadge } from "@/components/ui/status";
import { AttainmentChart } from "@/components/charts/attainment-chart";
import { Gauge } from "@/components/charts/gauge";
import { fmtDate, fmtGap, fmtPct } from "@/lib/utils";
import { CalculateButton } from "../calc-button";
import type { StepProps } from "./types";
import { FeedbackControls } from "./feedback-client";

type Att = Awaited<ReturnType<typeof getCourseAttainment>>;

function RunInfo({ att }: { att: Att }) {
  if (!att.run) return null;
  const m = att.run.methodology_snapshot;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>Calculated {fmtDate(att.run.created_at)} by {att.run.created_by_name}</span>
      <span>Methodology v{m.methodology_version}: Direct {m.direct_weight}% / Indirect {m.indirect_weight}%, threshold {m.student_threshold_pct}%, {m.assessment_weighting === "MARKS" ? "marks-pooled" : "assessment-weighted"}</span>
      <span>Engine {att.run.engine_version}</span>
      {att.run.stale && <Badge tone="amber">Out of date — recalculate</Badge>}
    </div>
  );
}

function CalcHeader({ offeringId, readOnly, att, title, description }: { offeringId: string; readOnly: boolean; att: Att; title: string; description: string }) {
  return (
    <CardHeader title={title} description={description} action={!readOnly && <CalculateButton offeringId={offeringId} label={att.run ? "Recalculate" : "Calculate attainment"} />} />
  );
}

export async function DirectStep({ offeringId, user, readOnly, ws }: StepProps) {
  const att = await getCourseAttainment(user, offeringId);
  return (
    <Card>
      <CalcHeader offeringId={offeringId} readOnly={readOnly} att={att} title="13 · Direct Attainment" description="CO-wise attainment from assessment marks. A student meets a CO when their score on the CO's questions reaches the threshold." />
      <CardBody className="space-y-4">
        <RunInfo att={att} />
        {!ws.progress.marks && <Alert tone="amber">Upload marks for every question before calculating.</Alert>}
        {att.direct.length === 0 ? <Empty icon={<Calculator />} title="Not calculated yet" /> : (
          <Table>
            <thead><tr><Th>CO</Th><Th>Target</Th><Th>Students assessed</Th><Th>Meeting threshold</Th><Th>Achievement</Th><Th>Level</Th><Th>Gap</Th><Th>Status</Th></tr></thead>
            <tbody>
              {att.direct.map((d) => (
                <tr key={d.co_id}>
                  <Td className="font-semibold text-violet-800">{d.co_code}</Td>
                  <Td className="tabular">{fmtPct(d.target_pct, 0)} <span className="text-[10px] text-muted">{d.target_source.toLowerCase()}</span></Td>
                  <Td className="tabular">{d.students_assessed}</Td>
                  <Td className="tabular">{d.students_meeting} <span className="text-xs text-muted">(≥ {d.threshold_pct}%)</span></Td>
                  <Td className="w-48"><div className="flex items-center gap-2"><Progress value={d.achievement_pct ?? 0} tone={d.status === "ACHIEVED" ? "green" : d.status === "CRITICAL" ? "red" : "amber"} /><span className="tabular w-14 text-right">{fmtPct(d.achievement_pct)}</span></div></Td>
                  <Td className="tabular">{d.attainment_level ?? "—"}</Td>
                  <Td className="tabular">{fmtGap(d.gap)}</Td>
                  <Td><GapBadge status={d.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {att.direct.map((d) => (
          <details key={d.co_id} className="rounded-xl bg-white/70 p-3 text-sm ring-1 ring-line">
            <summary className="cursor-pointer font-medium text-violet-800">View Calculation · {d.co_code}</summary>
            <p className="mt-2 font-mono text-xs text-ink">{d.formula}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div><div className="text-xs font-medium text-muted">Source questions</div><ul className="text-xs">{d.inputs.questions.map((q, i) => <li key={i}>{q.assessment} · {q.label} (max {q.maxMarks})</li>)}</ul></div>
              <div><div className="text-xs font-medium text-muted">Student CO-score distribution</div><ul className="text-xs">{d.inputs.distribution.map((b) => <li key={b.band}>{b.band}: {b.count}</li>)}</ul>
                {d.average_score_pct !== null && <div className="mt-1 text-xs">Average CO score: {fmtPct(d.average_score_pct)}</div>}</div>
            </div>
          </details>
        ))}
      </CardBody>
    </Card>
  );
}

export async function FeedbackStep({ offeringId, user, readOnly, ws }: StepProps) {
  const fb = await getFeedbackStatus(user, offeringId);
  const rate = fb.enrolled ? Math.round((fb.submitted / fb.enrolled) * 100) : 0;
  return (
    <Card>
      <CardHeader title="14 · Course Feedback" description={`Generated from the COs ("The course helped me achieve CO1 …"), Likert 1–${ws.settings.feedback_scale_max}. Only enrolled students can respond, once each; responses are anonymous.`} />
      <CardBody className="space-y-4">
        {!readOnly && <FeedbackControls offeringId={offeringId} status={fb.template?.status ?? null} hasCos={ws.progress.cos} />}
        {fb.template ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">Status</div><div className="text-lg font-semibold">{fb.template.status}</div></div>
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">Responses</div><div className="text-lg font-semibold">{fb.submitted} / {fb.enrolled}</div></div>
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">Response rate</div><div className="text-lg font-semibold">{rate}%</div><Progress value={rate} className="mt-1" /></div>
            </div>
            <Table>
              <thead><tr><Th>CO</Th><Th>Question</Th><Th>Ratings</Th><Th>Mean</Th></tr></thead>
              <tbody>{fb.questions.map((q) => <tr key={q.id}><Td className="font-semibold text-violet-800">{q.co_code}</Td><Td className="text-ink-2">{q.text}</Td><Td className="tabular">{q.responses}</Td><Td className="tabular">{q.mean ?? "—"}</Td></tr>)}</tbody>
            </Table>
          </>
        ) : <Empty title="Feedback not published yet" />}
      </CardBody>
    </Card>
  );
}

export async function IndirectStep({ offeringId, user, readOnly }: StepProps) {
  const att = await getCourseAttainment(user, offeringId);
  return (
    <Card>
      <CalcHeader offeringId={offeringId} readOnly={readOnly} att={att} title="15 · Indirect Attainment" description="CO-wise attainment from student course feedback." />
      <CardBody className="space-y-4">
        <RunInfo att={att} />
        {att.indirect.length === 0 ? <Empty title="No indirect attainment yet">Publish feedback, collect responses, then recalculate.</Empty> : (
          <Table>
            <thead><tr><Th>CO</Th><Th>Respondents</Th><Th>Mean rating</Th><Th>Indirect attainment</Th><Th>View calculation</Th></tr></thead>
            <tbody>
              {att.indirect.map((i) => (
                <tr key={i.co_id}>
                  <Td className="font-semibold text-violet-800">{i.co_code}</Td>
                  <Td className="tabular">{i.respondents}</Td>
                  <Td className="tabular">{i.mean_rating ?? "—"} / {i.scale_max}</Td>
                  <Td className="w-48"><div className="flex items-center gap-2"><Progress value={i.indirect_pct ?? 0} /><span className="tabular w-14 text-right">{fmtPct(i.indirect_pct)}</span></div></Td>
                  <Td className="text-xs"><details><summary className="cursor-pointer text-violet-700">Formula</summary><p className="mt-1 font-mono">{i.formula}</p><p className="mt-1">Distribution: {Object.entries(i.inputs.distribution).map(([k, v]) => `${k}★ ${v}`).join(" · ")}</p></details></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

export async function CourseAttainmentStep({ offeringId, user, readOnly }: StepProps) {
  const att = await getCourseAttainment(user, offeringId);
  const finals = att.final.filter((f) => f.final_pct !== null);
  const avg = finals.length === att.final.length && finals.length ? finals.reduce((a, f) => a + f.final_pct!, 0) / finals.length : null;
  const avgTarget = att.final.length ? att.final.reduce((a, f) => a + f.target_pct, 0) / att.final.length : 60;
  return (
    <div className="space-y-4">
      <Card>
        <CalcHeader offeringId={offeringId} readOnly={readOnly} att={att} title="16 · Final Course Attainment" description="Final CO attainment = Direct × direct weight + Indirect × indirect weight (institutional methodology — never hard-coded)." />
        <CardBody className="space-y-4">
          <RunInfo att={att} />
          {att.final.length === 0 ? <Empty title="Not calculated yet" /> : (
            <>
              <div className="grid items-center gap-4 lg:grid-cols-[1fr_180px]">
                <AttainmentChart data={att.final.map((f) => ({ code: f.co_code, direct: f.direct_pct, indirect: f.indirect_pct, final: f.final_pct, target: f.target_pct }))} />
                <Gauge value={avg === null ? null : Math.round(avg * 100) / 100} target={Math.round(avgTarget)} label="Course attainment (mean of COs)" />
              </div>
              <Table>
                <thead><tr><Th>CO</Th><Th>Direct</Th><Th>Indirect</Th><Th>Final</Th><Th>Level</Th><Th>Target</Th><Th>Gap</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {att.final.map((f) => (
                    <tr key={f.co_id}>
                      <Td className="font-semibold text-violet-800">{f.co_code}</Td>
                      <Td className="tabular">{fmtPct(f.direct_pct)}</Td>
                      <Td className="tabular">{fmtPct(f.indirect_pct)}</Td>
                      <Td className="tabular font-semibold">{fmtPct(f.final_pct)}</Td>
                      <Td className="tabular">{f.attainment_level ?? "—"}</Td>
                      <Td className="tabular">{fmtPct(f.target_pct, 0)}</Td>
                      <Td className="tabular">{fmtGap(f.gap)}</Td>
                      <Td><GapBadge status={f.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="space-y-2">
                {att.final.map((f) => (
                  <details key={f.co_id} className="rounded-xl bg-white/70 p-3 text-sm ring-1 ring-line">
                    <summary className="cursor-pointer font-medium text-violet-800">View Calculation · {f.co_code}</summary>
                    <p className="mt-2 font-mono text-xs">{f.formula}</p>
                  </details>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
      {att.history.length > 1 && (
        <Card>
          <CardHeader title="Calculation history" description="Every calculation run is retained for traceability." />
          <CardBody>
            <Table><thead><tr><Th>When</Th><Th>By</Th><Th>Methodology</Th></tr></thead>
              <tbody>{att.history.map((h) => <tr key={h.id}><Td className="text-xs">{fmtDate(h.created_at)}</Td><Td>{h.created_by_name}</Td><Td>v{h.methodology_version}</Td></tr>)}</tbody></Table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export async function ContributionStep({ offeringId, user, readOnly }: StepProps) {
  const att = await getCourseAttainment(user, offeringId);
  const table = (rows: Att["po"], kind: string) => (
    <Table>
      <thead><tr><Th>{kind}</Th><Th>Title</Th><Th>Σ correlation</Th><Th>Attainment</Th><Th>Level</Th><Th>View calculation</Th></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.code}>
            <Td className="font-semibold text-violet-800">{p.code}</Td>
            <Td className="text-ink-2">{p.title}</Td>
            <Td className="tabular">{p.mapping_sum || "—"}</Td>
            <Td className="w-48">{p.value_pct === null ? <span className="text-xs text-muted">not mapped</span> : <div className="flex items-center gap-2"><Progress value={p.value_pct} /><span className="tabular w-14 text-right">{fmtPct(p.value_pct)}</span></div>}</Td>
            <Td className="tabular">{p.attainment_level ?? "—"}</Td>
            <Td className="text-xs"><details><summary className="cursor-pointer text-violet-700">Formula</summary><p className="mt-1 font-mono">{p.formula}</p></details></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return (
    <div className="space-y-4">
      <Card>
        <CalcHeader offeringId={offeringId} readOnly={readOnly} att={att} title="17 · PO/PSO Contribution" description="Course-level outcome attainment = Σ(CO final × CO-PO correlation) ÷ Σ correlation. These values feed program attainment." />
        <CardBody className="space-y-4"><RunInfo att={att} />{att.po.length ? table(att.po, "PO") : <Empty title="Not calculated yet" />}</CardBody>
      </Card>
      {att.pso.length > 0 && <Card><CardHeader title="PSO contribution" /><CardBody>{table(att.pso, "PSO")}</CardBody></Card>}
    </div>
  );
}
