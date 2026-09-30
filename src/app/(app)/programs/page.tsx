import Link from "next/link";
import { Layers } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listPrograms } from "@/lib/services/academic";
import { getStructure } from "@/lib/services/admin";
import { Card, CardBody, CardHeader, Empty, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { CreateProgramForm } from "@/components/forms/program-forms";

export const metadata = { title: "Programs" };

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await listPrograms(user);
  const canCreate = can(user, "program.create");
  const structure = canCreate ? await getStructure(user) : null;
  const myDepts = structure?.departments.filter((d) => user.roles.includes("SUPER_ADMIN") || user.scopes.hodDepartments.includes(d.id)) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Academic Structure" title="Programs" description="Programs are created by the Head of Department, who then assigns a Program Coordinator to own courses and outcomes." />
      {canCreate && myDepts.length > 0 && (
        <Card>
          <CardHeader title="Create program" description="Only departments you head are listed." />
          <CardBody><CreateProgramForm departments={myDepts} /></CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Programs you can access" />
        <CardBody>
          {programs.length === 0 ? <Empty icon={<Layers />} title="No programs yet" /> : (
            <Table>
              <thead><tr><Th>Code</Th><Th>Program</Th><Th>Department</Th><Th>Coordinator(s)</Th><Th>Courses</Th><Th /></tr></thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-semibold text-violet-800">{p.code}</Td>
                    <Td>{p.name} <Badge className="ml-1">{p.level}</Badge></Td>
                    <Td className="text-ink-2">{p.department_name}</Td>
                    <Td className="text-ink-2">{p.coordinators ?? <span className="text-amber-700">Not assigned</span>}</Td>
                    <Td className="tabular">{p.course_count}</Td>
                    <Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/programs/${p.id}`}>Open</Link></Td>
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
