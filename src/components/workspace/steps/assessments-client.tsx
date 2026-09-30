"use client";
import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveAssessmentsAction, saveQuestionMappingAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Field, Input, Select, Alert } from "@/components/ui/primitives";
import { human } from "@/lib/utils";
import { move, RowControls } from "../list-editor";

const TYPES = ["INTERNAL", "MIDTERM", "END_SEMESTER", "QUIZ", "ASSIGNMENT", "LABORATORY", "PROJECT", "VIVA", "PRESENTATION"] as const;
type Q = { id?: string; label: string; maxMarks: number; coIds: string[]; marksCount?: number };
type A = { id?: string; name: string; assessmentType: (typeof TYPES)[number]; maxMarks: number; weightage: number; assessmentDate: string; questions: Q[] };
interface Data {
  assessments: { id: string; name: string; assessment_type: string; max_marks: number; weightage: number; assessment_date: string | null; questions: { id: string; label: string; max_marks: number; co_ids: string[]; marks_count: number }[] }[];
  cos: { id: string; code: string; description: string }[];
  allowMulti: boolean;
}

export function AssessmentsEditor({ offeringId, readOnly, data }: { offeringId: string; readOnly: boolean; data: Data }) {
  const [items, setItems] = useState<A[]>(data.assessments.map((a) => ({
    id: a.id, name: a.name, assessmentType: a.assessment_type as A["assessmentType"], maxMarks: a.max_marks, weightage: a.weightage, assessmentDate: a.assessment_date ?? "",
    questions: a.questions.map((q) => ({ id: q.id, label: q.label, maxMarks: q.max_marks, coIds: q.co_ids, marksCount: q.marks_count })),
  })));
  const save = useServerAction(saveAssessmentsAction);
  const set = (i: number, p: Partial<A>) => setItems(items.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const setQ = (i: number, k: number, p: Partial<Q>) => set(i, { questions: items[i].questions.map((q, j) => (j === k ? { ...q, ...p } : q)) });
  const totalW = items.reduce((a, b) => a + (Number(b.weightage) || 0), 0);
  const toggleCo = (i: number, k: number, co: string) => {
    const q = items[i].questions[k];
    const has = q.coIds.includes(co);
    setQ(i, k, { coIds: has ? q.coIds.filter((c) => c !== co) : data.allowMulti ? [...q.coIds, co] : [co] });
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="9 · Assessment Structure" description={`Assessments with maximum marks, weightage and question/component breakdown. Weightage total: ${totalW}% (must be 100 when used).`} />
        <CardBody className="space-y-4">
          {items.map((a, i) => {
            const qSum = a.questions.reduce((x, q) => x + (Number(q.maxMarks) || 0), 0);
            return (
              <div key={i} className="rounded-2xl bg-white/70 p-4 ring-1 ring-line">
                <div className="flex items-start gap-3">
                  <div className="grid flex-1 gap-3 md:grid-cols-5">
                    <Field label="Assessment name"><Input readOnly={readOnly} value={a.name} onChange={(e) => set(i, { name: e.target.value })} /></Field>
                    <Field label="Type"><Select disabled={readOnly} value={a.assessmentType} onChange={(e) => set(i, { assessmentType: e.target.value as A["assessmentType"] })}>{TYPES.map((t) => <option key={t} value={t}>{human(t)}</option>)}</Select></Field>
                    <Field label="Maximum marks"><Input type="number" min={1} readOnly={readOnly} value={a.maxMarks} onChange={(e) => set(i, { maxMarks: Number(e.target.value) })} /></Field>
                    <Field label="Weightage (%)"><Input type="number" min={0} max={100} readOnly={readOnly} value={a.weightage} onChange={(e) => set(i, { weightage: Number(e.target.value) })} /></Field>
                    <Field label="Date"><Input type="date" readOnly={readOnly} value={a.assessmentDate} onChange={(e) => set(i, { assessmentDate: e.target.value })} /></Field>
                  </div>
                  <RowControls i={i} n={items.length} readOnly={readOnly} onMove={(d) => setItems(move(items, i, d))} onDelete={() => setItems(items.filter((_, j) => j !== i))} />
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="text-sm">
                    <thead><tr><th className="px-2 py-1 text-left text-xs text-muted">Question</th><th className="px-2 py-1 text-left text-xs text-muted">Max</th>
                      {data.cos.map((c) => <th key={c.id} title={c.description} className="px-2 py-1 text-xs text-muted">{c.code}</th>)}<th /></tr></thead>
                    <tbody>
                      {a.questions.map((q, k) => (
                        <tr key={k}>
                          <td className="px-1 py-1"><Input className="w-20" aria-label="Question label" readOnly={readOnly} value={q.label} onChange={(e) => setQ(i, k, { label: e.target.value })} /></td>
                          <td className="px-1 py-1"><Input className="w-20" aria-label="Question max marks" type="number" min={0.5} step="0.5" readOnly={readOnly} value={q.maxMarks} onChange={(e) => setQ(i, k, { maxMarks: Number(e.target.value) })} /></td>
                          {data.cos.map((c) => (
                            <td key={c.id} className="px-2 text-center"><input type="checkbox" aria-label={`${q.label} maps to ${c.code}`} disabled={readOnly} checked={q.coIds.includes(c.id)} onChange={() => toggleCo(i, k, c.id)} /></td>
                          ))}
                          <td>{!readOnly && <Button type="button" size="icon" variant="ghost" aria-label="Remove question" disabled={!!q.marksCount} title={q.marksCount ? "Has marks" : undefined} onClick={() => set(i, { questions: a.questions.filter((_, j) => j !== k) })}><Trash2 /></Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {!readOnly && <Button type="button" size="sm" variant="secondary" onClick={() => set(i, { questions: [...a.questions, { label: `Q${a.questions.length + 1}`, maxMarks: 5, coIds: [] }] })}><Plus /> Add question</Button>}
                  <span className={qSum === a.maxMarks ? "text-emerald-700" : "text-amber-800"}>Questions total {qSum} / {a.maxMarks}</span>
                </div>
              </div>
            );
          })}
          {!readOnly && <Button variant="secondary" onClick={() => setItems([...items, { name: `Assessment ${items.length + 1}`, assessmentType: "INTERNAL", maxMarks: 20, weightage: 0, assessmentDate: "", questions: [{ label: "Q1", maxMarks: 20, coIds: [] }] }])}><Plus /> Add assessment</Button>}
          {!data.allowMulti && <Alert tone="blue">Institution policy: each question maps to exactly one CO.</Alert>}
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({ offeringId, items: items.map((a) => ({ ...a, assessmentDate: a.assessmentDate || null, questions: a.questions.map(({ marksCount: _m, ...q }) => q) })) })}><Save /> Save assessment structure</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}

export function QuestionMappingEditor({ offeringId, readOnly, data }: { offeringId: string; readOnly: boolean; data: Data }) {
  const [map, setMap] = useState<Record<string, string[]>>(Object.fromEntries(data.assessments.flatMap((a) => a.questions.map((q) => [q.id, q.co_ids]))));
  const save = useServerAction(saveQuestionMappingAction);
  const toggle = (q: string, co: string) => setMap({ ...map, [q]: map[q].includes(co) ? map[q].filter((c) => c !== co) : data.allowMulti ? [...map[q], co] : [co] });
  const coMarks = (co: string) => data.assessments.flatMap((a) => a.questions).filter((q) => map[q.id]?.includes(co)).reduce((x, q) => x + q.max_marks, 0);
  const unmappedQ = Object.entries(map).filter(([, v]) => v.length === 0).length;
  const unassessed = data.cos.filter((c) => coMarks(c.id) === 0).map((c) => c.code);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="10 · Question → CO Mapping" description={data.allowMulti ? "A question may assess several COs (it then counts fully toward each)." : "Each question maps to one CO."} />
        <CardBody className="space-y-3">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr><th className="px-2 py-1 text-left text-xs text-muted">Assessment · Question (max)</th>{data.cos.map((c) => <th key={c.id} title={c.description} className="px-3 py-1 text-xs font-semibold text-ink-2">{c.code}</th>)}</tr></thead>
              <tbody>
                {data.assessments.flatMap((a) => a.questions.map((q) => (
                  <tr key={q.id} className="border-t border-line/70">
                    <td className="px-2 py-1.5">{a.name} · <b>{q.label}</b> <span className="text-xs text-muted">({q.max_marks})</span></td>
                    {data.cos.map((c) => {
                      const on = map[q.id]?.includes(c.id);
                      return (
                        <td key={c.id} className="px-1 text-center">
                          <button type="button" disabled={readOnly} aria-pressed={on} aria-label={`${a.name} ${q.label} → ${c.code}`} onClick={() => toggle(q.id, c.id)}
                            className={`size-7 rounded-md border text-xs font-bold ${on ? "border-violet-600 bg-violet-600 text-white" : "border-line bg-white text-transparent hover:border-violet-300"}`}>✓</button>
                        </td>
                      );
                    })}
                  </tr>
                )))}
                <tr className="border-t border-line"><td className="px-2 py-1.5 text-xs text-muted">Marks assessing CO</td>{data.cos.map((c) => <td key={c.id} className="tabular px-1 text-center text-xs font-semibold">{coMarks(c.id)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          {(unmappedQ > 0 || unassessed.length > 0) && <Alert tone="amber">{unmappedQ > 0 && `${unmappedQ} question(s) have no CO. `}{unassessed.length > 0 && `Not assessed: ${unassessed.join(", ")}.`}</Alert>}
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({ offeringId, mapping: map })}><Save /> Save mapping</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}
