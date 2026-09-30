"use client";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { createBatchAction, createDepartmentAction, createSchoolAction, createUserAction, createYearAction, publishMethodologyAction, setUserActiveAction, updateSettingsAction } from "@/app/actions/misc";
import { Button } from "@/components/ui/button";
import { ActionButton, ResultMessage, useServerAction } from "@/components/ui/action";
import { Field, Input, Select } from "@/components/ui/primitives";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/rbac";
import { WEIGHT_LABELS } from "@/lib/domain/completion";
import type { Methodology } from "@/lib/domain/methodology";
import { AGGREGATION_LABELS } from "@/lib/domain/methodology";

export function SchoolForm() {
  const [f, setF] = useState({ name: "", code: "" });
  const { run, pending, result } = useServerAction(createSchoolAction);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(f).then((r) => r.ok && setF({ name: "", code: "" })); }}>
      <Field label="School name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Code"><Input required className="w-24" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
      <Button disabled={pending}><Plus /> Add school</Button><ResultMessage result={result} />
    </form>
  );
}
export function DepartmentForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [f, setF] = useState({ schoolId: schools[0]?.id ?? "", name: "", code: "" });
  const { run, pending, result } = useServerAction(createDepartmentAction);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(f).then((r) => r.ok && setF({ ...f, name: "", code: "" })); }}>
      <Field label="School"><Select value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <Field label="Department name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Code"><Input required className="w-24" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
      <Button disabled={pending}><Plus /> Add department</Button><ResultMessage result={result} />
    </form>
  );
}
export function YearForm() {
  const [f, setF] = useState({ name: "", startDate: "", endDate: "", isCurrent: false });
  const { run, pending, result } = useServerAction(createYearAction);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(f); }}>
      <Field label="Academic year"><Input required placeholder="2026-27" className="w-28" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Start"><Input required type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
      <Field label="End"><Input required type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={f.isCurrent} onChange={(e) => setF({ ...f, isCurrent: e.target.checked })} /> Current</label>
      <Button disabled={pending}><Plus /> Add year</Button><ResultMessage result={result} />
    </form>
  );
}
export function BatchForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [f, setF] = useState({ departmentId: departments[0]?.id ?? "", name: "", startYear: 2025, endYear: 2029 });
  const { run, pending, result } = useServerAction(createBatchAction);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(f); }}>
      <Field label="Department"><Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <Field label="Batch"><Input required placeholder="2025-29" className="w-28" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Start year"><Input type="number" className="w-24" value={f.startYear} onChange={(e) => setF({ ...f, startYear: Number(e.target.value) })} /></Field>
      <Field label="End year"><Input type="number" className="w-24" value={f.endYear} onChange={(e) => setF({ ...f, endYear: Number(e.target.value) })} /></Field>
      <Button disabled={pending}><Plus /> Add batch</Button><ResultMessage result={result} />
    </form>
  );
}

const GRANTABLE = ROLES.filter((r) => !["PROGRAM_COORDINATOR", "COURSE_COORDINATOR", "STUDENT"].includes(r));
export function UserForm({ departments, schools }: { departments: { id: string; name: string }[]; schools: { id: string; name: string }[] }) {
  const [f, setF] = useState({ email: "", fullName: "", designation: "", departmentId: "", password: "" });
  const [roles, setRoles] = useState<{ role: Role; departmentId?: string; schoolId?: string }[]>([{ role: "FACULTY" }]);
  const { run, pending, result } = useServerAction(createUserAction);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run({ ...f, departmentId: f.departmentId || null, roles: roles.map((r) => ({ role: r.role, departmentId: r.departmentId || null, schoolId: r.schoolId || null })) }); }}>
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="Full name"><Input required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Email"><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Designation"><Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
        <Field label="Department"><Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Initial password"><Input required type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-ink-2">Roles <span className="text-muted">(Program/Course Coordinator roles come from assignments)</span></div>
        {roles.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <Select className="w-56" value={r.role} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { role: e.target.value as Role } : x)))}>{GRANTABLE.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</Select>
            {r.role === "HOD" && <Select className="w-56" value={r.departmentId ?? ""} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { ...x, departmentId: e.target.value } : x)))}><option value="">Department…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
            {r.role === "DEAN" && <Select className="w-56" value={r.schoolId ?? ""} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { ...x, schoolId: e.target.value } : x)))}><option value="">School…</option>{schools.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
            <Button type="button" size="sm" variant="ghost" disabled={roles.length === 1} onClick={() => setRoles(roles.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="secondary" onClick={() => setRoles([...roles, { role: "FACULTY" }])}><Plus /> Add role</Button>
      </div>
      <div className="flex items-center gap-3"><Button disabled={pending}><Plus /> Create user</Button><ResultMessage result={result} /></div>
    </form>
  );
}
export function ToggleUser({ id, active }: { id: string; active: boolean }) {
  return <ActionButton size="sm" variant="ghost" confirm={active ? "Deactivate this user?" : undefined} action={() => setUserActiveAction(id, !active)}>{active ? "Deactivate" : "Activate"}</ActionButton>;
}

type Settings = { cam_scale_max: number; feedback_scale_max: number; allow_multi_co_questions: boolean; hod_approval_required: boolean; students_can_view_attainment: boolean; require_evidence: boolean; require_action_plan_for_gaps: boolean; default_co_target: number; default_po_target: number; ai_enabled: boolean; completion_weights: Record<string, number> };
export function SettingsForm({ s }: { s: Settings }) {
  const [f, setF] = useState(s);
  const { run, pending, result } = useServerAction(updateSettingsAction);
  const flag = (k: keyof Settings, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[k] as boolean} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}</label>
  );
  const total = Object.values(f.completion_weights).reduce((a, b) => a + Number(b), 0);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run({
      camScaleMax: f.cam_scale_max, feedbackScaleMax: f.feedback_scale_max, allowMultiCoQuestions: f.allow_multi_co_questions, hodApprovalRequired: f.hod_approval_required,
      studentsCanViewAttainment: f.students_can_view_attainment, requireEvidence: f.require_evidence, requireActionPlanForGaps: f.require_action_plan_for_gaps,
      defaultCoTarget: f.default_co_target, defaultPoTarget: f.default_po_target, aiEnabled: f.ai_enabled, completionWeights: f.completion_weights,
    }); }}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="CO-PO scale maximum" hint="0..max (default 3)"><Input type="number" min={1} max={5} value={f.cam_scale_max} onChange={(e) => setF({ ...f, cam_scale_max: Number(e.target.value) })} /></Field>
        <Field label="Feedback Likert maximum"><Input type="number" min={2} max={10} value={f.feedback_scale_max} onChange={(e) => setF({ ...f, feedback_scale_max: Number(e.target.value) })} /></Field>
        <Field label="Institution CO target (%)"><Input type="number" min={0} max={100} value={f.default_co_target} onChange={(e) => setF({ ...f, default_co_target: Number(e.target.value) })} /></Field>
        <Field label="Institution PO/PSO target (%)"><Input type="number" min={0} max={100} value={f.default_po_target} onChange={(e) => setF({ ...f, default_po_target: Number(e.target.value) })} /></Field>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {flag("hod_approval_required", "HOD approval stage required")}
        {flag("allow_multi_co_questions", "Allow a question to map to multiple COs")}
        {flag("require_evidence", "Evidence required before submission")}
        {flag("require_action_plan_for_gaps", "Action plan required for below-target gaps")}
        {flag("students_can_view_attainment", "Students may view final course attainment")}
        {flag("ai_enabled", "AI assistance enabled")}
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-ink-2">Course completion weights (total {total})</div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(f.completion_weights).map(([k, v]) => (
            <Field key={k} label={WEIGHT_LABELS[k] ?? k}><Input type="number" min={0} max={100} value={v} onChange={(e) => setF({ ...f, completion_weights: { ...f.completion_weights, [k]: Number(e.target.value) } })} /></Field>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3"><Button disabled={pending}><Save /> Save settings</Button><ResultMessage result={result} /></div>
    </form>
  );
}

export function MethodologyForm({ current }: { current: Methodology }) {
  const [m, setM] = useState<Methodology>(current);
  const [name, setName] = useState("Institutional OBE methodology");
  const { run, pending, result } = useServerAction(publishMethodologyAction);
  const num = (k: keyof Methodology) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: Number(e.target.value) });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run({ name, config: m }); }}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Preset">
          <Select value={`${m.direct_weight}/${m.indirect_weight}`} onChange={(e) => { const [d, i] = e.target.value.split("/").map(Number); if (!Number.isNaN(d)) setM({ ...m, direct_weight: d, indirect_weight: i }); }}>
            {["80/20", "70/30", "60/40", "100/0"].map((p) => <option key={p} value={p}>{p}</option>)}
            {!["80/20", "70/30", "60/40", "100/0"].includes(`${m.direct_weight}/${m.indirect_weight}`) && <option value={`${m.direct_weight}/${m.indirect_weight}`}>Custom</option>}
          </Select>
        </Field>
        <Field label="Direct weight (%)"><Input type="number" min={0} max={100} value={m.direct_weight} onChange={num("direct_weight")} /></Field>
        <Field label="Indirect weight (%)"><Input type="number" min={0} max={100} value={m.indirect_weight} onChange={num("indirect_weight")} /></Field>
        <Field label="Student threshold (% of CO marks)"><Input type="number" min={0} max={100} value={m.student_threshold_pct} onChange={num("student_threshold_pct")} /></Field>
        <Field label="Assessment weighting"><Select value={m.assessment_weighting} onChange={(e) => setM({ ...m, assessment_weighting: e.target.value as Methodology["assessment_weighting"] })}><option value="MARKS">Pool marks across assessments</option><option value="ASSESSMENT_WEIGHTAGE">Weight by assessment weightage</option></Select></Field>
        <Field label="Indirect method"><Select value={m.indirect_method} onChange={(e) => setM({ ...m, indirect_method: e.target.value as Methodology["indirect_method"] })}><option value="MEAN_SCALED">Mean rating ÷ scale max</option><option value="PERCENT_AGREE">% of ratings ≥ agree level</option></Select></Field>
        <Field label="Agree level (for % agree)"><Input type="number" min={1} max={10} value={m.indirect_agree_min} onChange={num("indirect_agree_min")} /></Field>
        <Field label="Program aggregation"><Select value={m.program_aggregation} onChange={(e) => setM({ ...m, program_aggregation: e.target.value as Methodology["program_aggregation"] })}>{Object.entries(AGGREGATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Program scope"><Select value={m.program_scope} onChange={(e) => setM({ ...m, program_scope: e.target.value as Methodology["program_scope"] })}><option value="ALL_CALCULATED">All calculated courses (provisional)</option><option value="LOCKED_ONLY">Approved & locked courses only</option></Select></Field>
        <Field label="Near-target margin (pts)"><Input type="number" min={0} value={m.near_target_margin} onChange={num("near_target_margin")} /></Field>
        <Field label="Critical margin (pts)"><Input type="number" min={0} value={m.critical_margin} onChange={num("critical_margin")} /></Field>
        <Field label="Level bands (min%:level)" hint="e.g. 70:3, 60:2, 50:1">
          <Input value={m.level_bands.map((b) => `${b.min}:${b.level}`).join(", ")} onChange={(e) => setM({ ...m, level_bands: e.target.value.split(",").map((s) => s.trim().split(":").map(Number)).filter((x) => x.length === 2 && x.every((n) => !Number.isNaN(n))).map(([min, level]) => ({ min, level })) })} />
        </Field>
      </div>
      <p className="text-xs text-muted">Final = Direct × {(m.direct_weight / 100).toFixed(2)} + Indirect × {(m.indirect_weight / 100).toFixed(2)}. Publishing creates a new version; previous calculations keep the version they used.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Version name"><Input className="w-72" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Button disabled={pending}><Save /> Publish new methodology version</Button>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
