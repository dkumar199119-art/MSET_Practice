"use client";
import { useState } from "react";
import { Save } from "lucide-react";
import { saveTargetsAction } from "@/app/actions/workspace";
import { resolveTarget } from "@/lib/domain/attainment";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Field, Input, Table, Td, Th, Badge, Empty } from "@/components/ui/primitives";

export function TargetsEditor({ offeringId, readOnly, cos, targets }: {
  offeringId: string; readOnly: boolean;
  cos: { id: string; code: string; description: string; target: number | null }[];
  targets: { institution: number; program: number | null; course: number | null; rationale: string | null; confirmed: boolean };
}) {
  const [course, setCourse] = useState(targets.course?.toString() ?? "");
  const [rationale, setRationale] = useState(targets.rationale ?? "");
  const [co, setCo] = useState<Record<string, string>>(Object.fromEntries(cos.map((c) => [c.id, c.target?.toString() ?? ""])));
  const save = useServerAction(saveTargetsAction);
  if (!cos.length) return <Empty title="Define course outcomes first" />;
  const courseNum = course === "" ? null : Number(course);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="6 · CO Targets" description="Target = expected % of students reaching the attainment threshold. Resolved by hierarchy: Institution → Program → Course → CO." />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">Institution default</div><div className="text-lg font-semibold">{targets.institution}%</div></div>
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line"><div className="text-xs text-muted">Program target</div><div className="text-lg font-semibold">{targets.program ?? "—"}{targets.program !== null && "%"}</div></div>
            <Field label="Course target (%)" hint="Blank = inherit"><Input type="number" min={0} max={100} step="0.5" readOnly={readOnly} value={course} onChange={(e) => setCourse(e.target.value)} /></Field>
            <Field label="Rationale"><Input readOnly={readOnly} value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
          </div>
          <Table>
            <thead><tr><Th>CO</Th><Th>Statement</Th><Th className="w-40">CO-specific target</Th><Th>Effective target</Th></tr></thead>
            <tbody>
              {cos.map((c) => {
                const r = resolveTarget({ co: co[c.id] === "" ? null : Number(co[c.id]), course: courseNum, program: targets.program, institution: targets.institution });
                return (
                  <tr key={c.id}>
                    <Td className="font-semibold text-violet-800">{c.code}</Td>
                    <Td className="text-ink-2">{c.description}</Td>
                    <Td><Input aria-label={`${c.code} target`} type="number" min={0} max={100} step="0.5" readOnly={readOnly} placeholder="inherit" value={co[c.id]} onChange={(e) => setCo({ ...co, [c.id]: e.target.value })} /></Td>
                    <Td><span className="font-semibold">{r.target}%</span> <Badge>{r.source.toLowerCase()}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {!targets.confirmed && <p className="text-xs text-amber-800">Save once to confirm the targets for this course (required for completion).</p>}
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({ offeringId, courseDefault: courseNum, rationale, coTargets: Object.fromEntries(Object.entries(co).map(([k, v]) => [k, v === "" ? null : Number(v)])) })}><Save /> Save targets</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}
