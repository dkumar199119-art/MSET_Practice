import { Download } from "lucide-react";
import { getMarksOverview } from "@/lib/services/marks";
import { Card, CardBody, CardHeader, Table, Td, Th, Empty } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import type { StepProps } from "./types";
import { MarksUploader } from "./marks-client";

export async function MarksStep({ offeringId, user, readOnly, ws }: StepProps) {
  const o = await getMarksOverview(user, offeringId);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="12 · Marks Upload" description="Upload CO-mapped question-wise marks (Excel or CSV). Every row is validated on the server; files with errors are never saved."
          action={<a className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/api/marks-template/${offeringId}`}><Download /> Download template</a>} />
        <CardBody>
          {readOnly ? <p className="text-sm text-muted">Marks cannot be changed in the current status.</p>
            : !ws.progress.question_mapping || !ws.progress.students ? <Empty title="Complete question mapping and student enrollment first" />
            : <MarksUploader offeringId={offeringId} courseCode={ws.ctx.course_code} />}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Marks entered" description={`${o.enrolled} enrolled students`} />
        <CardBody>
          <Table>
            <thead><tr><Th>Assessment</Th><Th>Question</Th><Th>Max</Th><Th>Entries</Th><Th>Average</Th></tr></thead>
            <tbody>{o.perQuestion.map((q, i) => <tr key={i}><Td>{q.assessment}</Td><Td>{q.label}</Td><Td className="tabular">{q.max_marks}</Td><Td className="tabular">{q.entries} / {o.enrolled}</Td><Td className="tabular">{q.avg ?? "—"}</Td></tr>)}</tbody>
          </Table>
          {o.uploads.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted">Upload history</div>
              <Table>
                <thead><tr><Th>File</Th><Th>Rows saved</Th><Th>By</Th><Th>When</Th></tr></thead>
                <tbody>{o.uploads.map((u) => <tr key={u.id}><Td>{u.file_name}</Td><Td className="tabular">{u.saved_rows} / {u.total_rows}</Td><Td>{u.uploaded_by_name}</Td><Td className="text-xs text-muted">{fmtDate(u.created_at)}</Td></tr>)}</tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
