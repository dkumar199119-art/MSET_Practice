import { Download, FileText } from "lucide-react";
import { listEvidence, EVIDENCE_TYPES } from "@/lib/services/evidence";
import { Card, CardBody, CardHeader, Empty, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate, human } from "@/lib/utils";
import type { StepProps } from "./types";
import { EvidenceUpload, DeleteEvidence } from "./evidence-client";

export async function EvidenceStep({ offeringId, user, ws }: StepProps) {
  const items = await listEvidence(user, offeringId);
  return (
    <Card>
      <CardHeader title="19 · Evidence" description="Attach supporting documents (question papers, lesson plans, student work, feedback, attainment and action-taken reports). Max 10 MB each; SHA-256 recorded." />
      <CardBody className="space-y-4">
        {ws.ctx.can_edit && <EvidenceUpload offeringId={offeringId} types={[...EVIDENCE_TYPES]} />}
        {items.length === 0 ? <Empty icon={<FileText />} title="No evidence attached" /> : (
          <Table>
            <thead><tr><Th>Type</Th><Th>Title</Th><Th>File</Th><Th>Version</Th><Th>Uploaded by</Th><Th>Date</Th><Th /></tr></thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <Td><Badge tone="violet">{human(e.evidence_type)}</Badge></Td>
                  <Td>{e.title}</Td>
                  <Td className="text-xs text-ink-2">{e.file_name} · {(e.size_bytes / 1024).toFixed(0)} KB</Td>
                  <Td className="tabular">v{e.version}</Td>
                  <Td>{e.uploaded_by_name}</Td>
                  <Td className="text-xs text-muted">{fmtDate(e.created_at)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/api/evidence/${e.id}`}><Download /></a>
                    {ws.ctx.can_edit && ws.ctx.editable && <DeleteEvidence offeringId={offeringId} id={e.id} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
