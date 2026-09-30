import { requireUser } from "@/lib/auth/session";
import { getStructure, listUsers } from "@/lib/services/admin";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES } from "@/lib/rbac";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { ToggleUser, UserForm } from "@/components/forms/admin-forms";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Users & Roles" };

export default async function Users() {
  const user = await requireUser();
  const users = await listUsers(user);
  const s = await getStructure(user);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Users & Roles" description="Institutional roles are granted here; Program Coordinator, Course Coordinator and teaching rights are derived from assignments in the academic workflow." />
      <Card><CardHeader title="Create user" /><CardBody><UserForm departments={s.departments} schools={s.schools} /></CardBody></Card>
      <Card>
        <CardHeader title={`Staff users (${users.length})`} />
        <CardBody>
          <Table><thead><tr><Th>Name</Th><Th>Email</Th><Th>Department</Th><Th>Roles</Th><Th>Last login</Th><Th /></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><Td>{u.full_name}<div className="text-xs text-muted">{u.designation}</div></Td><Td className="text-xs">{u.email}</Td><Td>{u.department ?? "—"}</Td>
              <Td><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="violet">{r}</Badge>)}</div></Td><Td className="text-xs text-muted">{fmtDate(u.last_login_at)}</Td>
              <Td className="text-right">{!u.is_active && <Badge tone="red">inactive</Badge>} {u.id !== user.id && <ToggleUser id={u.id} active={u.is_active} />}</Td></tr>)}</tbody></Table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Role-permission matrix" description="Scope (which department/program/course) is additionally enforced by database row level security." />
        <CardBody>
          <Table>
            <thead><tr><Th>Permission</Th>{ROLES.map((r) => <Th key={r} className="text-center">{ROLE_LABELS[r]}</Th>)}</tr></thead>
            <tbody>{Object.entries(PERMISSIONS).map(([p, d]) => <tr key={p}><Td className="text-xs"><b>{p}</b><div className="text-muted">{d}</div></Td>{ROLES.map((r) => <Td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p as never) ? "✓" : ""}</Td>)}</tr>)}</tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
