import Link from "next/link";
import { Gauge as GaugeIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { filterOptions, offeringsOverview, programOutcomeSummary, summarize, institutionCounts, type OverviewFilter } from "@/lib/services/dashboards";
import { Card, CardBody, CardHeader, Empty, PageHeader, Progress, Stat, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { GapBadge, WorkflowBadge } from "@/components/ui/status";
import { CompletionMetrics } from "@/components/workspace/metrics";
import { fmtPct } from "@/lib/utils";

export const metadata = { title: "IQAC Command Center" };

const KEYS = ["academicYearId", "semesterId", "schoolId", "departmentId", "programId", "batchId", "courseId", "facultyId"] as const;

export default async function Iqac({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const opts = await filterOptions(user);
  const filter: OverviewFilter = Object.fromEntries(KEYS.filter((k) => sp[k]).map((k) => [k, sp[k]]));
  const rows = await offeringsOverview(user, filter);
  const s = summarize(rows);
  const counts = await institutionCounts(user);
  const outcomes = await programOutcomeSummary(user, filter.academicYearId);
  const gapsBelow = outcomes.outcomes.filter((o) => o.status === "BELOW_TARGET" || o.status === "CRITICAL");
  const overdue = outcomes.actionPlans.reduce((a, p) => a + p.overdue, 0);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.school_name} › ${r.department_name} › ${r.program_code}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const sel = (name: (typeof KEYS)[number], label: string, items: { id: string; label: string }[]) => (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-ink-2">{label}</span>
      <select name={name} defaultValue={sp[name] ?? ""} className="h-9 w-full rounded-xl border border-lavender-200 bg-white/85 px-2 text-sm">
        <option value="">All</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="IQAC" title="IQAC Command Center" description="Institution-wide course completion, attainment, gaps and continuous-improvement status. Click any course to drill down." />
      <Card>
        <CardBody>
          <form method="get" className="grid gap-3 sm:grid-cols-4 xl:grid-cols-9">
            {sel("academicYearId", "Academic year", opts.years.map((y) => ({ id: y.id, label: y.name })))}
            {sel("semesterId", "Semester", opts.semesters.filter((x) => !sp.academicYearId || x.academic_year_id === sp.academicYearId).map((x) => ({ id: x.id, label: x.name })))}
            {sel("schoolId", "School", opts.schools.map((x) => ({ id: x.id, label: x.name })))}
            {sel("departmentId", "Department", opts.departments.map((x) => ({ id: x.id, label: x.name })))}
            {sel("programId", "Program", opts.programs.map((x) => ({ id: x.id, label: x.code })))}
            {sel("batchId", "Batch", opts.batches.map((x) => ({ id: x.id, label: x.name })))}
            {sel("courseId", "Course", opts.courses.map((x) => ({ id: x.id, label: x.code })))}
            {sel("facultyId", "Faculty", opts.faculty.map((x) => ({ id: x.id, label: x.full_name })))}
            <div className="flex items-end gap-2"><button className="h-9 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white">Apply</button><Link href="/iqac" className="h-9 rounded-xl px-2 py-2 text-sm text-ink-2">Reset</Link></div>
          </form>
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Programs" value={s.programs} sub={`${counts.programs} in institution`} />
        <Stat label="Courses offered" value={s.offerings} sub={`${s.courses} distinct courses`} />
        <Stat label="Faculty teaching" value={counts.faculty} />
        <Stat label="Students" value={counts.students} />
        <Stat label="Outcome gaps (PO/PSO)" value={gapsBelow.length} sub={`${s.cosBelow} CO gaps in courses`} />
        <Stat label="Open action plans" value={s.openActionPlans} sub={`${overdue} overdue`} />
      </div>
      <CompletionMetrics s={s} />

      <Card>
        <CardHeader title="Completion monitor" description="School › Department › Program › Course" />
        <CardBody className="space-y-5">
          {rows.length === 0 ? <Empty icon={<GaugeIcon />} title="No course offerings match the filters" /> : [...groups.entries()].map(([k, list]) => (
            <div key={k}>
              <div className="mb-2 text-sm font-semibold text-ink">{k}</div>
              <Table>
                <thead><tr><Th>Course</Th><Th>Faculty</Th><Th className="w-48">Completion</Th><Th>Status</Th><Th>Avg final CO</Th><Th>COs below</Th><Th>Feedback</Th><Th>Evidence</Th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <Td><Link href={`/workspace/${r.id}`} className="font-semibold text-violet-800 hover:underline">{r.course_code}</Link> <span className="text-ink-2">{r.course_name}</span> <span className="text-xs text-muted">{r.academic_year} §{r.section}</span></Td>
                      <Td className="text-ink-2">{r.faculty ?? "—"}</Td>
                      <Td><div className="flex items-center gap-2"><Progress value={r.completion} tone={r.completion === 100 ? "green" : "violet"} /><span className="tabular w-10 text-right text-xs font-semibold">{r.completion}%</span></div></Td>
                      <Td><WorkflowBadge status={r.status} stage={r.review_stage} /></Td>
                      <Td className="tabular">{fmtPct(r.avg_final)}</Td>
                      <Td className="tabular">{r.cos_below || "—"}</Td>
                      <Td className="tabular text-xs">{r.feedback_submitted}/{r.enrolled}</Td>
                      <Td className="tabular">{r.evidence_count}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Program PO / PSO attainment" description="Current program-level results (see Program Attainment for formulas)." />
        <CardBody>
          {outcomes.outcomes.length === 0 ? <Empty title="No program attainment calculated yet" /> : (
            <Table>
              <thead><tr><Th>Program</Th><Th>Outcome</Th><Th>Attainment</Th><Th>Target</Th><Th>Status</Th></tr></thead>
              <tbody>{outcomes.outcomes.map((o, i) => <tr key={i}><Td><Link className="hover:underline" href={`/attainment/${o.program_id}`}>{o.program_code}</Link></Td><Td><Badge>{o.kind}</Badge> <b>{o.code}</b></Td><Td className="tabular">{fmtPct(o.value_pct)}</Td><Td className="tabular">{fmtPct(o.target_pct, 0)}</Td><Td><GapBadge status={o.status} /></Td></tr>)}</tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
