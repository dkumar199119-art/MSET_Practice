import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listAudit } from "@/lib/services/admin";
import { Card, CardBody, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Audit Logs" };

const LABELS: Record<string, string> = {
  "programs:INSERT": "Program created", "courses:INSERT": "Course created", "faculty_assignments:INSERT": "Faculty allocated",
  "program_coordinators:INSERT": "Program Coordinator assigned", "course_coordinators:INSERT": "Course Coordinator assigned",
  "syllabus:INSERT": "Syllabus created", "syllabus:UPDATE": "Syllabus changed", "course_outcomes:INSERT": "CO created", "course_outcomes:UPDATE": "CO changed",
  "co_po_mappings:INSERT": "CAM changed", "co_po_mappings:UPDATE": "CAM changed", "assessments:INSERT": "Assessment created",
  "marks_uploads:MARKS_UPLOADED": "Marks uploaded", "calculation_runs:ATTAINMENT_CALCULATED": "Attainment calculated",
  "feedback_templates:FEEDBACK_SUBMITTED": "Feedback submitted", "ai_suggestions:AI_SUGGESTION_GENERATED": "AI suggestion generated",
  "ai_suggestions:UPDATE": "AI suggestion decided", "course_offerings:UPDATE": "Course workflow/status changed",
};

export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string; offering?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const rows = await listAudit(user, { entity: sp.entity || undefined, offeringId: sp.offering || undefined, limit: 300 });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Audit Logs" description="Append-only record written by database triggers: user, role, action, entity, old and new values, timestamp." />
      <Card>
        <CardBody>
          <form method="get" className="mb-4 flex gap-2">
            <input name="entity" defaultValue={sp.entity} placeholder="Entity (e.g. course_outcomes)" className="h-9 rounded-xl border border-lavender-200 bg-white/85 px-3 text-sm" />
            <button className="h-9 rounded-xl bg-violet-600 px-3 text-sm text-white">Filter</button>
            {(sp.entity || sp.offering) && <Link className="px-2 py-2 text-sm" href="/admin/audit">Reset</Link>}
          </form>
          <Table>
            <thead><tr><Th>When</Th><Th>User</Th><Th>Role</Th><Th>Event</Th><Th>Entity</Th><Th>Change</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="text-xs whitespace-nowrap text-muted">{fmtDate(r.created_at)}</Td>
                  <Td>{r.user_name ?? <span className="text-muted">system</span>}</Td>
                  <Td className="text-xs">{r.role ?? "—"}</Td>
                  <Td>{LABELS[`${r.entity}:${r.action}`] ?? <Badge>{r.action}</Badge>}</Td>
                  <Td className="text-xs"><Link className="hover:underline" href={`/admin/audit?entity=${r.entity}`}>{r.entity}</Link>{r.offering_id && <> · <Link className="text-violet-700 hover:underline" href={`/admin/audit?offering=${r.offering_id}`}>offering</Link></>}</Td>
                  <Td className="max-w-md text-xs">
                    <details><summary className="cursor-pointer text-violet-700">view</summary>
                      {r.old_value != null && <pre className="mt-1 max-h-40 overflow-auto rounded bg-rose-50 p-2 text-[10px]">{JSON.stringify(r.old_value, null, 1)}</pre>}
                      {r.new_value != null && <pre className="mt-1 max-h-40 overflow-auto rounded bg-emerald-50 p-2 text-[10px]">{JSON.stringify(r.new_value, null, 1)}</pre>}
                    </details>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
