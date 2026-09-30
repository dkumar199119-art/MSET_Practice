"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, FileUp, Plus, Save, Trash2 } from "lucide-react";
import { extractSyllabusTextAction, saveSyllabusAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Field, Input, Textarea, Alert } from "@/components/ui/primitives";
import { RichText } from "@/components/ui/rich-text";
import { AiBox, AiButton, useAi } from "../ai-panel";

type Unit = { unitNo: number; title: string; topics: string; hours: number };
interface Initial {
  syllabus: { overview: string; teaching_methodology: string; reference_books: string; digital_resources: string; source: string; raw_text: string | null } | null;
  units: { unit_no: number; title: string; topics: string; hours: number }[];
}

export function SyllabusEditor({ offeringId, readOnly, initial }: { offeringId: string; readOnly: boolean; initial: Initial }) {
  const [overview, setOverview] = useState(initial.syllabus?.overview ?? "");
  const [method, setMethod] = useState(initial.syllabus?.teaching_methodology ?? "");
  const [refs, setRefs] = useState(initial.syllabus?.reference_books ?? "");
  const [digital, setDigital] = useState(initial.syllabus?.digital_resources ?? "");
  const [raw, setRaw] = useState(initial.syllabus?.raw_text ?? "");
  const [source, setSource] = useState<"MANUAL" | "PASTE" | "UPLOAD">((initial.syllabus?.source as "MANUAL") ?? "MANUAL");
  const [units, setUnits] = useState<Unit[]>(initial.units.length ? initial.units.map((u) => ({ unitNo: u.unit_no, title: u.title, topics: u.topics, hours: u.hours })) : [{ unitNo: 1, title: "", topics: "", hours: 8 }]);
  const save = useServerAction(saveSyllabusAction);
  const extract = useServerAction(extractSyllabusTextAction);
  const ai = useAi(offeringId, "SYLLABUS_ANALYSIS");

  const renumber = (u: Unit[]) => u.map((x, i) => ({ ...x, unitNo: i + 1 }));
  const setUnit = (i: number, patch: Partial<Unit>) => setUnits(units.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...units];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setUnits(renumber(n));
  };
  const totalHours = units.reduce((a, u) => a + (Number(u.hours) || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="2 · Syllabus" description="Enter manually, paste, or upload the syllabus document (PDF/DOCX). Gemini can structure it into units — suggestions never overwrite your data until you accept." />
        <CardBody className="space-y-4">
          {!readOnly && (
            <div className="grid gap-3 rounded-xl border border-dashed border-lavender-300 bg-white/50 p-3 md:grid-cols-2">
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void extract.run(fd).then((r) => { if (r.ok && typeof r.data === "string") { setRaw(r.data); setSource("UPLOAD"); } });
              }}>
                <Field label="Upload syllabus (PDF, DOCX, TXT)"><Input name="file" type="file" accept=".pdf,.docx,.txt" required /></Field>
                <Button variant="secondary" disabled={extract.pending}><FileUp /> {extract.pending ? "Extracting…" : "Extract text"}</Button>
                <ResultMessage result={extract.result?.ok ? null : extract.result} />
              </form>
              <div className="flex flex-wrap items-end gap-2">
                <AiButton pending={ai.pending} disabled={raw.trim().length < 50 && units.every((u) => !u.title)} onClick={() => ai.request(raw)}>Analyze Syllabus</AiButton>
                <span className="text-xs text-muted">Structures pasted/uploaded text into units and highlights observations.</span>
              </div>
            </div>
          )}
          <Field label="Pasted / extracted syllabus text (source material)">
            <Textarea rows={5} readOnly={readOnly} value={raw} placeholder="Paste the syllabus here…" onChange={(e) => { setRaw(e.target.value); if (source === "MANUAL") setSource("PASTE"); }} />
          </Field>
          {(ai.data || ai.error) && (
            <AiBox title="AI syllabus analysis" model={ai.data?.model} error={ai.error} onDismiss={() => void ai.decide("REJECTED")}>
              {ai.data && (
                <div className="space-y-2 text-sm">
                  <p>{ai.data.output.summary}</p>
                  {ai.data.output.observations.length > 0 && <ul className="list-disc pl-5 text-ink-2">{ai.data.output.observations.map((o, i) => <li key={i}>{o}</li>)}</ul>}
                  {ai.data.output.units.length > 0 && (
                    <>
                      <ol className="list-decimal pl-5">{ai.data.output.units.map((u) => <li key={u.unit_no}><b>{u.title}</b> ({u.hours} h) — {u.topics}</li>)}</ol>
                      <Button size="sm" onClick={() => { setUnits(renumber(ai.data!.output.units.map((u) => ({ unitNo: u.unit_no, title: u.title, topics: u.topics, hours: u.hours })))); void ai.decide("ACCEPTED", ai.data!.output.units); }}>
                        Use these units in the editor
                      </Button>
                    </>
                  )}
                </div>
              )}
            </AiBox>
          )}
          <Field label="Course overview"><RichText value={overview} onChange={setOverview} readOnly={readOnly} placeholder="Course description / preamble" /></Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Units / modules" description={`${units.length} units · ${totalHours} contact hours`} />
        <CardBody className="space-y-3">
          {units.map((u, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-white/70 p-3 ring-1 ring-line md:grid-cols-12">
              <div className="flex items-center text-sm font-semibold text-violet-800 md:col-span-1">Unit {u.unitNo}</div>
              <Input className="md:col-span-7" aria-label={`Unit ${u.unitNo} title`} placeholder="Unit title" readOnly={readOnly} value={u.title} onChange={(e) => setUnit(i, { title: e.target.value })} />
              <Input className="md:col-span-2" aria-label={`Unit ${u.unitNo} hours`} type="number" min={0} step="0.5" readOnly={readOnly} value={u.hours} onChange={(e) => setUnit(i, { hours: Number(e.target.value) })} />
              {!readOnly && (
                <div className="flex justify-end gap-1 md:col-span-2">
                  <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={i === units.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Delete unit" disabled={units.length === 1} onClick={() => setUnits(renumber(units.filter((_, j) => j !== i)))}><Trash2 /></Button>
                </div>
              )}
              <Textarea className="md:col-span-12" rows={2} aria-label={`Unit ${u.unitNo} topics`} placeholder="Topics" readOnly={readOnly} value={u.topics} onChange={(e) => setUnit(i, { topics: e.target.value })} />
            </div>
          ))}
          {!readOnly && <Button type="button" variant="secondary" onClick={() => setUnits(renumber([...units, { unitNo: units.length + 1, title: "", topics: "", hours: 8 }]))}><Plus /> Add unit</Button>}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Teaching methodology"><Textarea rows={4} readOnly={readOnly} value={method} onChange={(e) => setMethod(e.target.value)} /></Field>
          <Field label="Reference books"><Textarea rows={4} readOnly={readOnly} value={refs} onChange={(e) => setRefs(e.target.value)} /></Field>
          <Field label="Digital resources"><Textarea rows={4} readOnly={readOnly} value={digital} onChange={(e) => setDigital(e.target.value)} /></Field>
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({ offeringId, overview, teachingMethodology: method, referenceBooks: refs, digitalResources: digital, source, rawText: raw || null, units: units.filter((u) => u.title.trim()) })}>
            <Save /> Save syllabus
          </Button>
          <ResultMessage result={save.result} />
        </div>
      )}
      {readOnly && <Alert tone="blue">Read-only view.</Alert>}
    </div>
  );
}
