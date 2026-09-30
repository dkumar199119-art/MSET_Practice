"use client";
import { useMemo, useState } from "react";
import { Save, Wand2 } from "lucide-react";
import { saveMatrixAction } from "@/app/actions/workspace";
import { matrixCoverage } from "@/lib/domain/coverage";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/primitives";
import { AiBox, AiButton, useAi } from "../ai-panel";
import { cn } from "@/lib/utils";

interface Data {
  cos: { id: string; code: string; description: string }[];
  outcomes: { id: string; code: string; title: string; description: string }[];
  cells: { co_id: string; outcome_id: string; value: number; source: string; ai_suggested_value: number | null }[];
  scaleMax: number;
  labels: Record<string, string>;
}

// sequential single-hue ramp (blue), 0 = neutral surface
const RAMP = ["#ffffff", "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#104281"];
const cellColor = (v: number, max: number) => (v <= 0 ? RAMP[0] : RAMP[Math.min(RAMP.length - 1, Math.round((v / max) * 4))]);

export function MatrixEditor({ offeringId, kind, readOnly, data }: { offeringId: string; kind: "PO" | "PSO"; readOnly: boolean; data: Data }) {
  const init: Record<string, Record<string, number>> = {};
  for (const c of data.cos) init[c.id] = Object.fromEntries(data.outcomes.map((o) => [o.id, data.cells.find((x) => x.co_id === c.id && x.outcome_id === o.id)?.value ?? 0]));
  const [cells, setCells] = useState(init);
  const [aiValues, setAiValues] = useState<Record<string, Record<string, number>> | null>(null);
  const [aiId, setAiId] = useState<string | null>(null);
  const save = useServerAction(saveMatrixAction);
  const ai = useAi(offeringId, kind === "PO" ? "SUGGEST_CO_PO" : "SUGGEST_CO_PSO");
  const flat = useMemo(() => Object.entries(cells).flatMap(([co, row]) => Object.entries(row).map(([o, v]) => ({ co_id: co, outcome_id: o, value: v }))), [cells]);
  const cov = matrixCoverage(data.cos, data.outcomes, flat);
  const sources = new Map(data.cells.map((c) => [`${c.co_id}|${c.outcome_id}`, c.source]));

  const suggestionMap = useMemo(() => {
    if (!ai.data) return null;
    const m: Record<string, Record<string, { value: number; rationale: string }>> = {};
    for (const s of ai.data.output.mappings) {
      const co = data.cos.find((c) => c.code.toUpperCase() === s.co_code.toUpperCase());
      const o = data.outcomes.find((x) => x.code.toUpperCase() === s.outcome_code.toUpperCase());
      if (!co || !o) continue;
      (m[co.id] ??= {})[o.id] = { value: Math.min(s.value, data.scaleMax), rationale: s.rationale };
    }
    return m;
  }, [ai.data, data]);

  const applySuggestion = () => {
    if (!suggestionMap || !ai.data) return;
    const next = structuredClone(cells);
    const vals: Record<string, Record<string, number>> = {};
    for (const c of data.cos) for (const o of data.outcomes) {
      const v = suggestionMap[c.id]?.[o.id]?.value ?? 0;
      next[c.id][o.id] = v;
      (vals[c.id] ??= {})[o.id] = v;
    }
    setCells(next);
    setAiValues(vals);
    setAiId(ai.data.suggestionId);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`${kind === "PO" ? "7" : "8"} · CO-${kind} Articulation Matrix`}
          description={`Correlation scale 0–${data.scaleMax}: ${Object.entries(data.labels).map(([k, v]) => `${k} = ${v}`).join(", ")}.`}
          action={!readOnly && <AiButton pending={ai.pending} onClick={() => ai.request()}>Suggest CO-{kind} Mapping</AiButton>} />
        <CardBody className="space-y-4">
          {(ai.data || ai.error) && (
            <AiBox title={`AI suggested CO-${kind} mapping`} model={ai.data?.model} error={ai.error} onDismiss={() => { void ai.decide("REJECTED"); setAiValues(null); setAiId(null); }}>
              <p className="text-sm text-ink-2">Suggested values are shown in the corner of each cell. Apply them to the matrix, then adjust and save. Your saved matrix records whether each cell was accepted as-is or modified.</p>
              <Button className="mt-2" size="sm" onClick={applySuggestion}><Wand2 /> Apply suggestion to matrix (unsaved)</Button>
              <details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">Rationale</summary>
                <ul className="mt-1 list-disc pl-5">{ai.data?.output.mappings.filter((m) => m.value > 0).map((m, i) => <li key={i}><b>{m.co_code}→{m.outcome_code} = {m.value}</b>: {m.rationale}</li>)}</ul>
              </details>
            </AiBox>
          )}
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white/90 px-2 py-1 text-left text-xs text-muted">CO \ {kind}</th>
                  {data.outcomes.map((o) => <th key={o.id} title={`${o.title}: ${o.description}`} className="px-1 py-1 text-center text-xs font-semibold text-ink-2">{o.code}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.cos.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" title={c.description} className="sticky left-0 bg-white/90 px-2 py-1 text-left text-xs font-semibold text-violet-800">{c.code}</th>
                    {data.outcomes.map((o) => {
                      const v = cells[c.id][o.id];
                      const sug = suggestionMap?.[c.id]?.[o.id]?.value;
                      const src = sources.get(`${c.id}|${o.id}`);
                      return (
                        <td key={o.id} className="p-0.5">
                          <div className="relative">
                            <select aria-label={`${c.code} to ${o.code}`} disabled={readOnly} value={v}
                              onChange={(e) => setCells({ ...cells, [c.id]: { ...cells[c.id], [o.id]: Number(e.target.value) } })}
                              className={cn("h-9 w-12 appearance-none rounded-md border border-line text-center text-sm font-semibold", v >= Math.ceil(data.scaleMax * 0.66) ? "text-white" : "text-ink")}
                              style={{ background: cellColor(v, data.scaleMax) }}>
                              {Array.from({ length: data.scaleMax + 1 }, (_, i) => <option key={i} value={i} className="text-ink">{i === 0 ? "–" : i}</option>)}
                            </select>
                            {sug !== undefined && sug > 0 && <span className="pointer-events-none absolute -top-1 -right-1 rounded bg-violet-600 px-1 text-[9px] font-bold text-white" title="AI suggested">{sug}</span>}
                            {src && src !== "MANUAL" && <span className="pointer-events-none absolute -bottom-1 -left-1 size-2 rounded-full bg-violet-500" title={src === "AI_ACCEPTED" ? "AI accepted" : "AI modified"} />}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Legend:</span>
            {Array.from({ length: data.scaleMax + 1 }, (_, i) => <span key={i} className="flex items-center gap-1"><span className="inline-block size-3 rounded border border-line" style={{ background: cellColor(i, data.scaleMax) }} />{i} {data.labels[String(i)] ?? ""}</span>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">CO mapping coverage</div><div className="text-lg font-semibold">{cov.coCoverage}%</div></div>
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">{kind} mapping coverage</div><div className="text-lg font-semibold">{cov.outcomeCoverage}%</div></div>
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line sm:col-span-2"><div className="text-xs text-muted">Unmapped COs</div><div className="mt-1 flex flex-wrap gap-1">{cov.unmappedCos.length ? cov.unmappedCos.map((x) => <Badge key={x} tone="amber">{x}</Badge>) : <span className="text-sm text-emerald-700">None</span>}</div>
              <div className="mt-2 text-xs text-muted">Unmapped {kind}s</div><div className="mt-1 flex flex-wrap gap-1">{cov.unmappedOutcomes.length ? cov.unmappedOutcomes.map((x) => <Badge key={x}>{x}</Badge>) : <span className="text-sm text-emerald-700">None</span>}</div></div>
          </div>
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({ offeringId, kind, cells, aiSuggestionId: aiId, aiValues })}><Save /> Save CO-{kind} matrix</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}
