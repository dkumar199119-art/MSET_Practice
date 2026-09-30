import { requireUser } from "@/lib/auth/session";
import { listMethodologies } from "@/lib/services/admin";
import { tx } from "@/lib/services/base";
import { loadSettings } from "@/lib/services/workspace";
import { loadMethodology } from "@/lib/services/attainment";
import { aiStatus } from "@/lib/services/ai";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th, Badge, Alert } from "@/components/ui/primitives";
import { MethodologyForm, SettingsForm } from "@/components/forms/admin-forms";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Settings & Methodology" };

export default async function SettingsPage() {
  const user = await requireUser();
  const { settings, methodology } = await tx(user, async (db) => ({ settings: await loadSettings(db), methodology: await loadMethodology(db, null) }));
  const versions = await listMethodologies(user);
  const ai = aiStatus();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Settings & Methodology" description="Institution-level configuration used by every calculation. Nothing in the engine is hard-coded." />
      <Card><CardHeader title="Institutional settings" /><CardBody><SettingsForm s={settings} /></CardBody></Card>
      <Card>
        <CardHeader title={`Attainment methodology (active: v${methodology.version})`} description="Direct/indirect weights, thresholds, attainment levels, gap bands and program aggregation." />
        <CardBody className="space-y-4">
          <MethodologyForm current={methodology.config} />
          <Table><thead><tr><Th>Version</Th><Th>Scope</Th><Th>Name</Th><Th>Weights</Th><Th>Created</Th><Th /></tr></thead>
            <tbody>{versions.map((v) => <tr key={v.id}><Td>v{v.version}</Td><Td>{v.program_code ?? "Institution"}</Td><Td>{v.name}</Td><Td className="tabular">{v.config.direct_weight}/{v.config.indirect_weight}</Td><Td className="text-xs text-muted">{fmtDate(v.created_at)} {v.created_by_name}</Td><Td>{v.is_active && <Badge tone="green">active</Badge>}</Td></tr>)}</tbody></Table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="AI configuration" />
        <CardBody>
          <Alert tone={ai.configured ? "green" : "amber"} title={ai.configured ? `Gemini configured (${ai.model})` : "Gemini not configured"}>
            The API key is read server-side from GEMINI_API_KEY and never sent to the browser. Only aggregated, anonymised academic data is sent. All interactions are logged.
          </Alert>
        </CardBody>
      </Card>
    </div>
  );
}
