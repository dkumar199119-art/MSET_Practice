"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { createActionPlanAction, updateActionPlanStatusAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { AiBox, AiButton, useAi } from "../ai-panel";

type Draft = { gapId: string; level: string; entityCode: string; rootCause: string; correctiveAction: string; targetDate: string; source: "MANUAL" | "AI_ACCEPTED" | "AI_MODIFIED"; aiText?: string };
type GapRef = { id: string; level: string; code: string; classification: string };

/** AI analysis + action-plan form sharing one draft (AI suggestions prefill the form). */
export function GapsPlanner({ offeringId, gaps, canPlan, showAi }: { offeringId: string; gaps: GapRef[]; canPlan: boolean; showAi: boolean }) {
  const first = gaps.find((g) => ["BELOW_TARGET", "CRITICAL"].includes(g.classification)) ?? gaps[0];
  const blank: Draft = { gapId: first?.id ?? "", level: first?.level ?? "CO", entityCode: first?.code ?? "", rootCause: "", correctiveAction: "", targetDate: "", source: "MANUAL" };
  const [draft, setDraft] = useState<Draft>(blank);
  return (
    <>
      {showAi && <AiGapAnalysis offeringId={offeringId} gaps={gaps} canPlan={canPlan} onDraft={(p) => setDraft((d) => ({ ...d, ...p }))} />}
      {canPlan && gaps.length > 0 && (
        <Card>
          <CardHeader title="New corrective action plan" description="Gap → root cause → corrective action → responsible person → target date." />
          <CardBody><ActionPlanForm offeringId={offeringId} gaps={gaps} d={draft} setD={setDraft} reset={() => setDraft(blank)} /></CardBody>
        </Card>
      )}
    </>
  );
}

function AiGapAnalysis({ offeringId, gaps, canPlan, onDraft }: { offeringId: string; gaps: GapRef[]; canPlan: boolean; onDraft: (d: Partial<Draft>) => void }) {
  const ai = useAi(offeringId, "GAP_ANALYSIS");
  const o = ai.data?.output;
  const section = (title: string, items: string[]) => items.length > 0 && (
    <div><div className="text-xs font-semibold text-violet-900">{title}</div><ul className="list-disc pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  );
  return (
    <Card>
      <CardHeader title="AI gap analysis (Gemini)" description="Only aggregated, anonymised results are sent — no student names, IDs or individual marks." action={<AiButton pending={ai.pending} onClick={() => ai.request()}>Explain gaps & suggest actions</AiButton>} />
      {(o || ai.error) && (
        <CardBody>
          <AiBox title="AI-generated analysis — requires academic review." model={ai.data?.model} error={ai.error}>
            {o && (
              <div className="grid gap-3 md:grid-cols-2">
                {section("Patterns", o.patterns)}
                {section("Possible reasons", o.possible_reasons)}
                {section("Teaching interventions", o.teaching_interventions)}
                {section("Assessment improvements", o.assessment_improvements)}
                {section("Remedial activities", o.remedial_activities)}
                {section("Monitoring plan", o.monitoring_plan)}
                {o.corrective_actions.length > 0 && (
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-violet-900">Suggested corrective actions</div>
                    <ul className="mt-1 space-y-1.5">
                      {o.corrective_actions.map((c, i) => (
                        <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-white/80 p-2 text-sm">
                          <div><b>{c.level} {c.entity_code}</b>: {c.corrective_action}<div className="text-xs text-muted">Root cause: {c.root_cause}</div></div>
                          {canPlan && <Button size="sm" variant="secondary" onClick={() => { onDraft({ gapId: gaps.find((g) => g.code === c.entity_code && g.level === c.level)?.id ?? "", level: c.level, entityCode: c.entity_code, rootCause: c.root_cause, correctiveAction: c.corrective_action, source: "AI_ACCEPTED", aiText: c.corrective_action }); void ai.decide("PARTIALLY_ACCEPTED", c); }}>Use as draft</Button>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </AiBox>
        </CardBody>
      )}
    </Card>
  );
}

function ActionPlanForm({ offeringId, gaps, d, setD, reset }: { offeringId: string; gaps: GapRef[]; d: Draft; setD: (d: Draft) => void; reset: () => void }) {
  const save = useServerAction(createActionPlanAction);
  return (
    <form className="grid gap-3 rounded-xl border border-dashed border-lavender-300 bg-white/50 p-3 md:grid-cols-6" onSubmit={(e) => {
      e.preventDefault();
      const source = d.aiText === undefined ? "MANUAL" : d.aiText === d.correctiveAction ? "AI_ACCEPTED" : "AI_MODIFIED";
      void save.run({ offeringId, gapId: d.gapId || null, level: d.level as "CO", entityCode: d.entityCode, rootCause: d.rootCause, correctiveAction: d.correctiveAction, targetDate: d.targetDate || null, source }).then((r) => r.ok && reset());
    }}>
      <Field label="Gap" className="md:col-span-2">
        <Select value={d.gapId} onChange={(e) => { const g = gaps.find((x) => x.id === e.target.value); if (g) setD({ ...d, gapId: g.id, level: g.level, entityCode: g.code }); }}>
          {gaps.map((g) => <option key={g.id} value={g.id}>{g.level} {g.code} — {g.classification.replace("_", " ").toLowerCase()}</option>)}
        </Select>
      </Field>
      <Field label="Target date"><Input type="date" value={d.targetDate} onChange={(e) => setD({ ...d, targetDate: e.target.value })} /></Field>
      <div className="md:col-span-3" />
      <Field label="Root cause" className="md:col-span-3"><Textarea required minLength={10} rows={2} value={d.rootCause} onChange={(e) => setD({ ...d, rootCause: e.target.value })} /></Field>
      <Field label="Corrective action" className="md:col-span-3"><Textarea required minLength={10} rows={2} value={d.correctiveAction} onChange={(e) => setD({ ...d, correctiveAction: e.target.value })} /></Field>
      <div className="flex items-center gap-3 md:col-span-6"><Button disabled={save.pending}><Plus /> Add action plan</Button><ResultMessage result={save.result} /></div>
    </form>
  );
}

export function ActionPlanStatus({ offeringId, id, status }: { offeringId: string; id: string; status: string }) {
  const { run, pending } = useServerAction(updateActionPlanStatusAction);
  return (
    <Select aria-label="Action plan status" className="h-8 w-36 text-xs" disabled={pending} value={status} onChange={(e) => void run(offeringId, id, e.target.value as "PLANNED")}>
      {["PLANNED", "IN_PROGRESS", "IMPLEMENTED", "REVIEWED", "CLOSED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}
    </Select>
  );
}
