import { requireUser } from "@/lib/auth/session";
import { offeringsOverview } from "@/lib/services/dashboards";
import { listCalendar, listPrograms } from "@/lib/services/academic";
import { REPORT_TYPES } from "@/lib/reports/datasets";
import { Card, CardBody, CardHeader, Empty, PageHeader, Table, Td, Th, Alert } from "@/components/ui/primitives";
import { WorkflowBadge } from "@/components/ui/status";
import { ReportLinks } from "@/components/reports/report-links";

export const metadata = { title: "Reports" };

export default async function Reports() {
  const user = await requireUser();
  const offerings = (await offeringsOverview(user)).filter((o) => o.progress.final);
  const programs = await listPrograms(user);
  const cal = await listCalendar(user);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reports" title="Reports" description="PDF, Excel and CSV reports generated from live calculation runs. Every report states methodology version, formulas and calculation date." />
      <Card>
        <CardHeader title="Course reports" description={`${REPORT_TYPES.COURSE_ATTAINMENT}, ${REPORT_TYPES.COURSE_PO_PSO}, ${REPORT_TYPES.COURSE_GAP}`} />
        <CardBody>
          {offerings.length === 0 ? <Empty title="No course has final attainment yet" /> : (
            <Table>
              <thead><tr><Th>Course</Th><Th>Status</Th><Th>Course Attainment</Th><Th>PO/PSO Attainment</Th><Th>Gap Analysis</Th></tr></thead>
              <tbody>
                {offerings.map((o) => (
                  <tr key={o.id}>
                    <Td><b className="text-violet-800">{o.course_code}</b> {o.course_name}<div className="text-xs text-muted">{o.program_code} · {o.academic_year} · §{o.section}</div></Td>
                    <Td><WorkflowBadge status={o.status} /></Td>
                    <Td><ReportLinks query={{ type: "COURSE_ATTAINMENT", offeringId: o.id }} /></Td>
                    <Td><ReportLinks query={{ type: "COURSE_PO_PSO", offeringId: o.id }} /></Td>
                    <Td><ReportLinks query={{ type: "COURSE_GAP", offeringId: o.id }} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Program reports" description={`${REPORT_TYPES.PROGRAM_ATTAINMENT} and ${REPORT_TYPES.PROGRAM_GAP} — calculate program attainment first on the Program Attainment page.`} />
        <CardBody>
          <Table>
            <thead><tr><Th>Program</Th><Th>Academic year</Th><Th>Program Attainment</Th><Th>Program Gap Analysis</Th></tr></thead>
            <tbody>
              {programs.flatMap((p) => cal.years.map((y) => (
                <tr key={p.id + y.id}>
                  <Td><b className="text-violet-800">{p.code}</b> {p.name}</Td><Td>{y.name}</Td>
                  <Td><ReportLinks query={{ type: "PROGRAM_ATTAINMENT", programId: p.id, academicYearId: y.id }} /></Td>
                  <Td><ReportLinks query={{ type: "PROGRAM_GAP", programId: p.id, academicYearId: y.id }} /></Td>
                </tr>
              )))}
            </tbody>
          </Table>
          <Alert tone="blue" className="mt-3">The one-click accreditation (ZIP) package is planned for Phase 4 and is not part of this MVP.</Alert>
        </CardBody>
      </Card>
    </div>
  );
}
