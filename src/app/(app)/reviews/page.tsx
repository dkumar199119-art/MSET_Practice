import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getReviewQueue } from "@/lib/services/workflow";
import { Card, CardBody, CardHeader, Empty, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";
import { fmtDate, human } from "@/lib/utils";

export const metadata = { title: "Review Queue" };

export default async function Reviews() {
  const user = await requireUser();
  const q = await getReviewQueue(user);
  const mine = q.rows.filter((r) => r.my_stage);
  const others = q.rows.filter((r) => !r.my_stage);
  const table = (rows: typeof q.rows) => (
    <Table>
      <thead><tr><Th>Course</Th><Th>Program</Th><Th>Offering</Th><Th>Faculty</Th><Th>Status</Th><Th>Submitted</Th><Th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><b className="text-violet-800">{r.course_code}</b> {r.course_name}</Td>
            <Td><Badge tone="violet">{r.program_code}</Badge></Td>
            <Td className="text-xs text-ink-2">{r.academic_year} · {r.semester} · §{r.section}</Td>
            <Td>{r.faculty}</Td>
            <Td><WorkflowBadge status={r.status} stage={r.review_stage} /></Td>
            <Td className="text-xs text-muted">{fmtDate(r.submitted_at)}</Td>
            <Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/workspace/${r.id}/submission`}>{r.my_stage ? "Review" : "View"}</Link></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Review" title="Review Queue" description="Course submissions at your review stage, pending revision requests and recent decisions." />
      <Card><CardHeader title={`Awaiting your decision (${mine.length})`} /><CardBody>{mine.length ? table(mine) : <Empty icon={<ClipboardCheck />} title="Nothing waiting for you" />}</CardBody></Card>
      {q.revisions.length > 0 && (
        <Card>
          <CardHeader title="Revision requests" description="Requests to reopen approved, locked course data." />
          <CardBody>
            <Table><thead><tr><Th>Course</Th><Th>Reason</Th><Th>Requested by</Th><Th /></tr></thead>
              <tbody>{q.revisions.map((r) => <tr key={r.id}><Td className="font-semibold">{r.course_code}</Td><Td>{r.reason}</Td><Td>{r.requested_by_name}</Td><Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/workspace/${r.offering_id}/submission`}>{r.can_decide ? "Decide" : "View"}</Link></Td></tr>)}</tbody></Table>
          </CardBody>
        </Card>
      )}
      {others.length > 0 && <Card><CardHeader title="In review at other stages" /><CardBody>{table(others)}</CardBody></Card>}
      <Card>
        <CardHeader title="Recent workflow activity" />
        <CardBody>
          <Table><thead><tr><Th>When</Th><Th>Course</Th><Th>Action</Th><Th>By</Th></tr></thead>
            <tbody>{q.recent.map((r, i) => <tr key={i}><Td className="text-xs text-muted">{fmtDate(r.created_at)}</Td><Td><Link className="hover:underline" href={`/workspace/${r.id}/submission`}>{r.course_code}</Link></Td><Td>{human(r.action)} → {human(r.to_status)}</Td><Td>{r.actor_name}</Td></tr>)}</tbody></Table>
        </CardBody>
      </Card>
    </div>
  );
}
