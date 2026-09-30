import { requireUser } from "@/lib/auth/session";
import { getStructure } from "@/lib/services/admin";
import { can } from "@/lib/rbac";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { BatchForm, DepartmentForm, SchoolForm, YearForm } from "@/components/forms/admin-forms";

export const metadata = { title: "Institution & Calendar" };

export default async function Structure() {
  const user = await requireUser();
  const s = await getStructure(user);
  const admin = can(user, "institution.manage");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Academic Structure" title={s.institution?.name ?? "Institution"} description="Institution → School → Department → Program → Course. Programs are created by HODs." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Schools & departments" />
          <CardBody className="space-y-4">
            {admin && <SchoolForm />}
            {admin && <DepartmentForm schools={s.schools} />}
            <Table><thead><tr><Th>School</Th><Th>Department</Th><Th>HOD</Th><Th>Programs</Th></tr></thead>
              <tbody>{s.departments.map((d) => <tr key={d.id}><Td className="text-ink-2">{d.school_name}</Td><Td><b>{d.code}</b> {d.name}</Td><Td>{d.hod ?? <span className="text-amber-700">—</span>}</Td><Td className="tabular">{d.programs}</Td></tr>)}</tbody></Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Academic calendar" />
          <CardBody className="space-y-4">
            {admin && <YearForm />}
            <Table><thead><tr><Th>Academic year</Th><Th>Dates</Th><Th>Semesters</Th></tr></thead>
              <tbody>{s.years.map((y) => <tr key={y.id}><Td><b>{y.name}</b> {y.is_current && <Badge tone="green">current</Badge>}</Td><Td className="text-xs">{y.start_date} → {y.end_date}</Td><Td className="text-xs">{s.semesters.filter((x) => x.academic_year === y.name).map((x) => x.name).join(", ")}</Td></tr>)}</tbody></Table>
            {admin && <BatchForm departments={s.departments} />}
            <Table><thead><tr><Th>Batch</Th><Th>Department</Th><Th>Years</Th></tr></thead>
              <tbody>{s.batches.map((b) => <tr key={b.id}><Td><b>{b.name}</b></Td><Td>{b.department}</Td><Td className="tabular">{b.start_year}–{b.end_year}</Td></tr>)}</tbody></Table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
