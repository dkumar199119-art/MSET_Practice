"use client";
import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { enrollBatchAction, enrollRollsAction, withdrawStudentAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ActionButton, ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Table, Td, Th, Textarea, Badge, Empty } from "@/components/ui/primitives";

export function StudentsPanel({ offeringId, readOnly, rows, batch, section }: { offeringId: string; readOnly: boolean; batch: string; section: string; rows: { student_id: string; roll_no: string; full_name: string; section: string | null; status: string; marks_count: number }[] }) {
  const [rolls, setRolls] = useState("");
  const batchRun = useServerAction(enrollBatchAction);
  const rollRun = useServerAction(enrollRollsAction);
  const enrolled = rows.filter((r) => r.status === "ENROLLED").length;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="11 · Students / Section" description={`Batch ${batch}, Section ${section}. ${enrolled} students enrolled.`} />
        <CardBody className="space-y-4">
          {!readOnly && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
                <div className="mb-2 text-sm font-medium">Enroll the section roster</div>
                <Button disabled={batchRun.pending} onClick={() => void batchRun.run(offeringId).then((r) => r.ok && batchRun.setResult({ ok: true, message: `${r.data} student(s) enrolled` }))}><Users /> Enroll Batch {batch} · Section {section}</Button>
                <ResultMessage result={batchRun.result} className="mt-2" />
              </div>
              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
                <div className="mb-2 text-sm font-medium">Add by roll number</div>
                <Textarea rows={2} placeholder="ME23001, ME23002 …" value={rolls} onChange={(e) => setRolls(e.target.value)} />
                <Button className="mt-2" variant="secondary" disabled={rollRun.pending || !rolls.trim()} onClick={() => void rollRun.run(offeringId, rolls.split(/[\s,;]+/)).then((r) => r.ok && (setRolls(""), rollRun.setResult({ ok: true, message: `${r.data} student(s) enrolled` })))}><UserPlus /> Add</Button>
                <ResultMessage result={rollRun.result} className="mt-2" />
              </div>
            </div>
          )}
          {rows.length === 0 ? <Empty title="No students enrolled" /> : (
            <Table>
              <thead><tr><Th>Roll no</Th><Th>Name</Th><Th>Section</Th><Th>Status</Th><Th>Mark entries</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <Td className="tabular font-medium">{r.roll_no}</Td><Td>{r.full_name}</Td><Td>{r.section}</Td>
                    <Td><Badge tone={r.status === "ENROLLED" ? "green" : "neutral"}>{r.status.toLowerCase()}</Badge></Td>
                    <Td className="tabular">{r.marks_count}</Td>
                    <Td className="text-right">{!readOnly && r.status === "ENROLLED" && <ActionButton size="sm" variant="ghost" confirm={`Withdraw ${r.roll_no}? Their marks are excluded from attainment.`} action={() => withdrawStudentAction(offeringId, r.student_id)}>Withdraw</ActionButton>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
