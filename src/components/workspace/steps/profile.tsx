import { Lock } from "lucide-react";
import { listCorrections } from "@/lib/services/workspace";
import { Card, CardBody, CardHeader, Badge, Table, Td, Th } from "@/components/ui/primitives";
import { human, fmtDate } from "@/lib/utils";
import type { StepProps } from "./types";
import { ConfirmProfile, CorrectionForm } from "./profile-client";

export async function ProfileStep({ offeringId, user, ws, readOnly }: StepProps) {
  const c = ws.ctx;
  const corrections = await listCorrections(user, offeringId);
  const fields: [string, string][] = [
    ["Course Code", c.course_code], ["Course Name", c.course_name], ["Program", `${c.program_code} ${c.program_name}`],
    ["Department", c.department_name], ["School", c.school_name], ["Semester", `${c.semester} (Sem ${c.semester_number})`],
    ["Credits", String(c.credits)], ["L / T / P", `${c.lecture_hours} / ${c.tutorial_hours} / ${c.practical_hours}`],
    ["Academic Year", c.academic_year], ["Batch", c.batch], ["Section", c.section], ["Course Type", human(c.course_type)],
    ["Course Category", c.category], ["Course Coordinator", c.coordinators.map((x) => x.full_name).join(", ") || "—"],
    ["Assigned Faculty", c.faculty.map((f) => `${f.full_name} (${human(f.course_role)})`).join(", ") || "—"],
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1 · Course Profile" description="Pre-filled from the program's course catalogue. Protected fields cannot be edited here — request a correction if anything is wrong." />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-line">
                <dt className="flex items-center gap-1 text-[11px] font-medium text-muted"><Lock className="size-3" /> {k}</dt>
                <dd className="text-sm font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center gap-3">
            {c.profile_confirmed_at ? <Badge tone="green">Confirmed {fmtDate(c.profile_confirmed_at)}</Badge> : !readOnly && <ConfirmProfile offeringId={offeringId} />}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Correction requests" description="Sent to the Program Coordinator." />
        <CardBody className="space-y-4">
          {!readOnly && <CorrectionForm offeringId={offeringId} />}
          {corrections.length > 0 && (
            <Table>
              <thead><tr><Th>Field</Th><Th>Requested value</Th><Th>Reason</Th><Th>Status</Th><Th>By</Th></tr></thead>
              <tbody>{corrections.map((r) => <tr key={r.id}><Td>{r.field}</Td><Td>{r.requested_value}</Td><Td className="text-ink-2">{r.reason}</Td><Td><Badge>{r.status}</Badge></Td><Td className="text-xs text-muted">{r.requested_by_name}</Td></tr>)}</tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
