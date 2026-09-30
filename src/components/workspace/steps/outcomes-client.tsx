"use client";
import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Plus, Save } from "lucide-react";
import { saveOutcomesAction } from "@/app/actions/workspace";
import { BLOOM_LABELS, BLOOM_LEVELS, checkMeasurability, type BloomLevel } from "@/lib/domain/bloom";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Field, Input, Select, Textarea, Badge } from "@/components/ui/primitives";
import { AiBox, AiButton, useAi } from "../ai-panel";
import { move, RowControls } from "../list-editor";

type Co = { id?: string; description: string; bloomLevel: BloomLevel | null; target: string; weightage: number; source: "MANUAL" | "AI_ACCEPTED" | "AI_MODIFIED"; aiSuggestionId?: string | null; aiText?: string };
type Initial = { id: string; description: string; bloom_level: string | null; target: number | null; weightage: number; source: string };

export function OutcomesEditor({ offeringId, readOnly, initial }: { offeringId: string; readOnly: boolean; initial: Initial[] }) {
  const [cos, setCos] = useState<Co[]>(initial.map((c) => ({ id: c.id, description: c.description, bloomLevel: c.bloom_level as BloomLevel | null, target: c.target?.toString() ?? "", weightage: c.weightage, source: c.source as Co["source"] })));
  const save = useServerAction(saveOutcomesAction);
  const suggest = useAi(offeringId, "SUGGEST_COS");
  const review = useAi(offeringId, "CO_REVIEW");
  const [added, setAdded] = useState<Set<number>>(new Set());
  const set = (i: number, p: Partial<Co>) => setCos(cos.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="4 · Course Outcomes" description="Measurable student outcomes (CO1…COn). Each CO is validated for a measurable Bloom action verb."
          action={!readOnly && (
            <div className="flex gap-2">
              <AiButton pending={suggest.pending} onClick={() => suggest.request()}>Suggest COs</AiButton>
              <AiButton pending={review.pending} disabled={!cos.length} onClick={() => review.request()}>Improve / check measurability</AiButton>
            </div>
          )} />
        <CardBody className="space-y-3">
          {(suggest.data || suggest.error) && (
            <AiBox title="Suggested course outcomes" model={suggest.data?.model} error={suggest.error} onDismiss={() => void suggest.decide("REJECTED")}>
              <ul className="space-y-2">
                {suggest.data?.output.cos.map((c, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-white/80 p-2 text-sm">
                    <div><div>{c.description}</div><div className="text-xs text-muted">{BLOOM_LABELS[c.bloom_level]} · {c.rationale}</div></div>
                    <Button size="sm" variant="secondary" disabled={added.has(i)} onClick={() => {
                      setCos([...cos, { description: c.description, bloomLevel: c.bloom_level, target: "", weightage: 1, source: "AI_ACCEPTED", aiSuggestionId: suggest.data!.suggestionId, aiText: c.description }]);
                      const n = new Set(added).add(i);
                      setAdded(n);
                      void suggest.decide(n.size === suggest.data!.output.cos.length ? "ACCEPTED" : "PARTIALLY_ACCEPTED", [...n].map((k) => suggest.data!.output.cos[k]));
                    }}><Check /> {added.has(i) ? "Added" : "Accept"}</Button>
                  </li>
                ))}
              </ul>
            </AiBox>
          )}
          {(review.data || review.error) && (
            <AiBox title="CO review" model={review.data?.model} error={review.error} onDismiss={() => void review.decide("REJECTED")}>
              <ul className="space-y-2">
                {review.data?.output.reviews.map((r) => {
                  const idx = Number(r.co_code.replace(/\D/g, "")) - 1;
                  return (
                    <li key={r.co_code} className="rounded-lg bg-white/80 p-2 text-sm">
                      <div className="flex items-center gap-2"><b>{r.co_code}</b> {r.measurable ? <Badge tone="green">measurable</Badge> : <Badge tone="amber">not measurable</Badge>} <Badge tone="violet">{BLOOM_LABELS[r.suggested_bloom]}</Badge></div>
                      <div className="mt-1">{r.improved_statement}</div>
                      <div className="text-xs text-muted">{r.rationale}</div>
                      {cos[idx] && <Button className="mt-1" size="sm" variant="secondary" onClick={() => { set(idx, { description: r.improved_statement, bloomLevel: r.suggested_bloom, source: "AI_MODIFIED", aiSuggestionId: review.data!.suggestionId, aiText: r.improved_statement }); void review.decide("PARTIALLY_ACCEPTED", { [r.co_code]: r.improved_statement }); }}>Use improved statement</Button>}
                    </li>
                  );
                })}
              </ul>
            </AiBox>
          )}
          {cos.map((c, i) => {
            const chk = checkMeasurability(c.description, c.bloomLevel);
            return (
              <div key={i} className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 pt-2 text-sm font-semibold text-violet-800">CO{i + 1}</div>
                  <div className="flex-1 space-y-2">
                    <Textarea rows={2} aria-label={`CO${i + 1} statement`} readOnly={readOnly} value={c.description} onChange={(e) => set(i, { description: e.target.value })} />
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="Bloom level">
                        <Select disabled={readOnly} value={c.bloomLevel ?? ""} onChange={(e) => set(i, { bloomLevel: (e.target.value || null) as BloomLevel | null })}>
                          <option value="">— select —</option>
                          {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{BLOOM_LABELS[b]}</option>)}
                        </Select>
                      </Field>
                      <Field label="CO target (%)" hint="Blank = course default"><Input type="number" min={0} max={100} step="0.5" readOnly={readOnly} value={c.target} onChange={(e) => set(i, { target: e.target.value })} /></Field>
                      <Field label="Weightage"><Input type="number" min={0.1} step="0.1" readOnly={readOnly} value={c.weightage} onChange={(e) => set(i, { weightage: Number(e.target.value) })} /></Field>
                    </div>
                    {c.description.trim().length > 0 && (
                      <div className={`flex items-start gap-1.5 text-xs ${chk.measurable && chk.issues.length === 0 ? "text-emerald-700" : "text-amber-800"}`}>
                        {chk.measurable && chk.issues.length === 0 ? <CheckCircle2 className="mt-0.5 size-3.5" /> : <AlertTriangle className="mt-0.5 size-3.5" />}
                        <span>{chk.measurable && chk.issues.length === 0 ? `Measurable — action verb “${chk.verb}” (${BLOOM_LABELS[chk.detectedLevel!]})` : chk.issues.join(" ")}
                          {!readOnly && chk.detectedLevel && !c.bloomLevel && <button className="ml-2 underline" onClick={() => set(i, { bloomLevel: chk.detectedLevel })}>Use {BLOOM_LABELS[chk.detectedLevel]}</button>}</span>
                      </div>
                    )}
                    {c.source !== "MANUAL" && <Badge tone="violet">AI-assisted</Badge>}
                  </div>
                  <RowControls i={i} n={cos.length} readOnly={readOnly} onMove={(d) => setCos(move(cos, i, d))} onDelete={() => setCos(cos.filter((_, j) => j !== i))} />
                </div>
              </div>
            );
          })}
          {!readOnly && <Button variant="secondary" onClick={() => setCos([...cos, { description: "", bloomLevel: null, target: "", weightage: 1, source: "MANUAL" }])}><Plus /> Add CO</Button>}
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({
            offeringId,
            items: cos.filter((c) => c.description.trim()).map((c) => ({
              id: c.id, description: c.description, bloomLevel: c.bloomLevel, target: c.target === "" ? null : Number(c.target), weightage: c.weightage,
              source: c.aiText === undefined ? c.source : c.aiText === c.description ? "AI_ACCEPTED" : "AI_MODIFIED", aiSuggestionId: c.aiSuggestionId ?? null,
            })),
          })}><Save /> Save course outcomes</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}
