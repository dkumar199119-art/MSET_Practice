import Link from "next/link";
import { Target } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listPrograms } from "@/lib/services/academic";
import { Card, CardBody, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";

export const metadata = { title: "Program Attainment" };

export default async function AttainmentIndex() {
  const user = await requireUser();
  const programs = await listPrograms(user);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Attainment" title="Program Attainment" description="Course CO attainment → CO-PO mapping → course PO contribution → aggregated program PO/PSO attainment." />
      <Card><CardBody>
        {programs.length === 0 ? <Empty icon={<Target />} title="No programs visible" /> : (
          <Table><thead><tr><Th>Program</Th><Th>Department</Th><Th>Courses</Th><Th /></tr></thead>
            <tbody>{programs.map((p) => <tr key={p.id}><Td><b className="text-violet-800">{p.code}</b> {p.name}</Td><Td>{p.department_name}</Td><Td className="tabular">{p.course_count}</Td><Td className="text-right"><Link className="text-violet-700 hover:underline" href={`/attainment/${p.id}`}>View attainment</Link></Td></tr>)}</tbody></Table>
        )}
      </CardBody></Card>
    </div>
  );
}
