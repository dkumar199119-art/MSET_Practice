import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getProgram, listCalendar } from "@/lib/services/academic";
import { getProgramAttainment, loadMethodology } from "@/lib/services/attainment";
import { tx } from "@/lib/services/base";
import { AGGREGATION_LABELS } from "@/lib/domain/methodology";
import { Alert, Card, CardBody, CardHeader, Empty, PageHeader, Progress, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { GapBadge } from "@/components/ui/status";
import { ReportLinks } from "@/components/reports/report-links";
import { fmtDate, fmtGap, fmtPct } from "@/lib/utils";
import { ProgramCalcButton } from "./calc";

const RAMP = ["#f4f3f8", "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#104281"];
const heat = (v: number | null) => (v === null ? RAMP[0] : RAMP[Math.max(1, Math.min(5, Math.ceil(v / 20)))]);

export default async function ProgramAttainmentPage({ params, searchParams }: { params: Promise<{ programId: string }>; searchParams: Promise<{ ay?: string }> }) {
  const { programId } = await params;
  const { ay } = await searchParams;
  const user = await requireUser();
  const prog = await getProgram(user, programId).catch((e) => { if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); throw e; });
  const cal = await listCalendar(user);
  const year = cal.years.find((y) => y.id === ay) ?? cal.years.find((y) => y.is_current) ?? cal.years[0];
  const pa = await getProgramAttainment(user, programId, year.id);
  const methodology = await tx(user, (db) => loadMethodology(db, programId));
  const canCalc = prog.program.can_manage || user.roles.includes("IQAC_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const courses = [...new Set(pa.matrix.map((m) => m.course_code))];
  const poCodes = prog.pos.map((p) => p.code);
  const section = (rows: typeof pa.po, kind: string) => (
    <Table>
      <thead><tr><Th>{kind}</Th><Th>Title</Th><Th>Attainment</Th><Th>Level</Th><Th>Target</Th><Th>Gap</Th><Th>Status</Th><Th>Contributing courses</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code}>
            <Td className="font-semibold text-violet-800">{r.code}</Td>
            <Td className="text-ink-2">{r.title}</Td>
            <Td className="w-44">{r.value_pct === null ? "—" : <div className="flex items-center gap-2"><Progress value={r.value_pct} /><span className="tabular w-14 text-right">{fmtPct(r.value_pct)}</span></div>}</Td>
            <Td className="tabular">{r.attainment_level ?? "—"}</Td>
            <Td className="tabular">{fmtPct(r.target_pct, 0)}</Td>
            <Td className="tabular">{fmtGap(r.gap)}</Td>
            <Td><GapBadge status={r.status} /></Td>
            <Td className="text-xs">
              {r.contributing.map((c) => <span key={c.courseCode} className="mr-2 whitespace-nowrap">{c.courseCode} {c.valuePct}%{!c.locked && <span className="text-amber-700">*</span>}</span>)}
              <details><summary className="cursor-pointer text-violet-700">Formula</summary><p className="font-mono">{r.formula}</p></details>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={<Link href={`/programs/${programId}`} className="hover:underline">{prog.program.code}</Link>} title={`Program Attainment · ${prog.program.name}`}
        description={`Aggregation: ${AGGREGATION_LABELS[methodology.config.program_aggregation]} · scope: ${methodology.config.program_scope === "LOCKED_ONLY" ? "approved (locked) courses only" : "all calculated courses"} · methodology v${methodology.version}`}
        actions={
          <form className="flex items-center gap-2" method="get">
            <select name="ay" defaultValue={year.id} className="h-9 rounded-xl border border-lavender-200 bg-white/85 px-3 text-sm">{cal.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
            <button className="h-9 rounded-xl bg-white/80 px-3 text-sm ring-1 ring-lavender-200">Show</button>
          </form>
        } />
      <Card>
        <CardHeader title={`Academic year ${year.name}`} description={pa.summary ? `Calculated ${fmtDate(pa.summary.created_at)} · ${pa.summary.courses_included} contributing course(s)` : "Not calculated yet"}
          action={<div className="flex flex-wrap gap-2">{canCalc && <ProgramCalcButton programId={programId} academicYearId={year.id} />}{pa.summary && <ReportLinks query={{ type: "PROGRAM_ATTAINMENT", programId, academicYearId: year.id }} />}</div>} />
        <CardBody className="space-y-4">
          {pa.summary?.provisional && <Alert tone="amber" title="Provisional">Includes courses not yet approved and locked (marked *). Values may change.</Alert>}
          {pa.po.length ? section(pa.po, "PO") : <Empty title="No program attainment for this year yet">Calculate after course attainment has been finalised.</Empty>}
        </CardBody>
      </Card>
      {pa.pso.length > 0 && <Card><CardHeader title="PSO attainment" /><CardBody>{section(pa.pso, "PSO")}</CardBody></Card>}
      {courses.length > 0 && (
        <Card>
          <CardHeader title="Course × PO contribution heatmap" description="Course-level PO attainment (%). Darker = higher." />
          <CardBody className="overflow-x-auto">
            <table className="text-xs">
              <thead><tr><th className="px-2 py-1 text-left text-muted">Course</th>{poCodes.map((p) => <th key={p} className="px-1 py-1 text-muted">{p}</th>)}</tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c}>
                    <th className="px-2 py-1 text-left font-semibold text-violet-800">{c}</th>
                    {poCodes.map((p) => {
                      const v = pa.matrix.find((m) => m.course_code === c && m.po_code === p)?.value_pct ?? null;
                      return <td key={p} className="p-0.5"><div title={`${c} ${p}: ${v ?? "not mapped"}`} className={`grid h-8 w-12 place-items-center rounded-md tabular ${v !== null && v > 60 ? "text-white" : "text-ink"}`} style={{ background: heat(v) }}>{v === null ? "–" : v.toFixed(0)}</div></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex gap-3 text-[11px] text-muted"><Badge>– not mapped</Badge>{["1–20", "21–40", "41–60", "61–80", "81–100"].map((l, i) => <span key={l} className="flex items-center gap-1"><span className="inline-block size-3 rounded" style={{ background: RAMP[i + 1] }} />{l}%</span>)}</div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
