"use client";
import { useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { assignProgramCoordinatorAction, createCourseAction, createProgramAction, deleteOutcomeAction, removeProgramCoordinatorAction, updateProgramTargetsAction, upsertOutcomeAction } from "@/app/actions/academic";
import { Button } from "@/components/ui/button";
import { ActionButton, ResultMessage, useServerAction } from "@/components/ui/action";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";

export function CreateProgramForm({ departments }: { departments: { id: string; name: string }[] }) {
  const { run, pending, result } = useServerAction(createProgramAction);
  const [f, setF] = useState({ departmentId: departments[0]?.id ?? "", code: "", name: "", level: "UG" as const, durationYears: 4, initializeStandardPOs: true });
  return (
    <form className="grid gap-3 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); void run(f).then((r) => r.ok && setF({ ...f, code: "", name: "" })); }}>
      <Field label="Department" className="md:col-span-2">
        <Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      </Field>
      <Field label="Program code"><Input required placeholder="BTECH-ME" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
      <Field label="Program name" className="md:col-span-3"><Input required placeholder="B.Tech Mechanical Engineering" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Level">
        <Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as "UG" })}>{["UG", "PG", "DIPLOMA", "DOCTORAL", "CERTIFICATE"].map((l) => <option key={l}>{l}</option>)}</Select>
      </Field>
      <Field label="Duration (years)"><Input type="number" min={1} max={7} value={f.durationYears} onChange={(e) => setF({ ...f, durationYears: Number(e.target.value) })} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-2 md:col-span-3">
        <input type="checkbox" checked={f.initializeStandardPOs} onChange={(e) => setF({ ...f, initializeStandardPOs: e.target.checked })} />
        Initialise with the 12 standard engineering POs (graduate attributes)
      </label>
      <div className="flex items-end md:col-span-1"><Button disabled={pending} className="w-full"><Plus /> Create program</Button></div>
      <ResultMessage result={result} className="md:col-span-6" />
    </form>
  );
}

export function AssignCoordinator({ staff, onAssign, label }: { staff: { id: string; full_name: string; department_code: string | null }[]; onAssign: (userId: string) => ReturnType<typeof assignProgramCoordinatorAction>; label: string }) {
  const [userId, setUserId] = useState("");
  const { run, pending, result } = useServerAction(onAssign);
  return (
    <div>
      <div className="flex gap-2">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={label}>
          <option value="">Select faculty…</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.department_code ? ` (${s.department_code})` : ""}</option>)}
        </Select>
        <Button type="button" disabled={!userId || pending} onClick={() => void run(userId)}><UserPlus /> {label}</Button>
      </div>
      <ResultMessage result={result} className="mt-1" />
    </div>
  );
}

export function AssignProgramCoordinator({ programId, staff }: { programId: string; staff: { id: string; full_name: string; department_code: string | null }[] }) {
  return <AssignCoordinator staff={staff} label="Assign Program Coordinator" onAssign={(u) => assignProgramCoordinatorAction(programId, u)} />;
}

export function RemovePcButton({ programId, userId }: { programId: string; userId: string }) {
  return <ActionButton size="sm" variant="ghost" confirm="Remove this program coordinator?" action={() => removeProgramCoordinatorAction(programId, userId)}>Remove</ActionButton>;
}

export function ProgramTargetsForm({ programId, co, po }: { programId: string; co: number | null; po: number | null }) {
  const [v, setV] = useState({ co: co?.toString() ?? "", po: po?.toString() ?? "" });
  const { run, pending, result } = useServerAction(updateProgramTargetsAction);
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run({ programId, defaultCoTarget: v.co === "" ? null : Number(v.co), defaultPoTarget: v.po === "" ? null : Number(v.po) }); }}>
      <Field label="Program CO target (%)" hint="Blank = institution default"><Input className="w-40" type="number" min={0} max={100} step="0.5" value={v.co} onChange={(e) => setV({ ...v, co: e.target.value })} /></Field>
      <Field label="Program PO/PSO target (%)" hint="Blank = institution default"><Input className="w-40" type="number" min={0} max={100} step="0.5" value={v.po} onChange={(e) => setV({ ...v, po: e.target.value })} /></Field>
      <Button disabled={pending} variant="secondary">Save targets</Button>
      <ResultMessage result={result} />
    </form>
  );
}

type Outcome = { id: string; code: string; title: string; description: string; target: number | null };
export function OutcomeEditor({ programId, kind, items, canManage }: { programId: string; kind: "PO" | "PSO"; items: Outcome[]; canManage: boolean }) {
  const blank = { code: `${kind}${items.length + 1}`, title: "", description: "", target: "" };
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ code: string; title: string; description: string; target: string }>(blank);
  const save = useServerAction(upsertOutcomeAction);
  return (
    <div className="space-y-3">
      {items.map((o) => (
        <div key={o.id} className="rounded-xl border border-line bg-white/70 p-3">
          {editing === o.id ? (
            <div className="grid gap-2 md:grid-cols-6">
              <Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} aria-label="Code" />
              <Input className="md:col-span-4" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="Title" />
              <Input type="number" placeholder="Target %" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} aria-label="Target" />
              <Textarea className="md:col-span-6" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} aria-label="Description" />
              <div className="flex gap-2 md:col-span-6">
                <Button size="sm" onClick={() => void save.run({ kind, programId, id: o.id, code: edit.code, title: edit.title, description: edit.description, target: edit.target === "" ? null : Number(edit.target) }).then((r) => r.ok && setEditing(null))}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm"><span className="font-semibold text-violet-800">{o.code}</span> <span className="font-medium">{o.title}</span>{o.target !== null && <span className="ml-2 text-xs text-muted">target {o.target}%</span>}</div>
                <p className="mt-0.5 text-sm text-ink-2">{o.description}</p>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(o.id); setEdit({ code: o.code, title: o.title, description: o.description, target: o.target?.toString() ?? "" }); }}>Edit</Button>
                  <ActionButton size="icon" variant="ghost" aria-label={`Delete ${o.code}`} confirm={`Delete ${o.code}? Mappings referencing it prevent deletion.`} action={() => deleteOutcomeAction(programId, kind, o.id)}><Trash2 /></ActionButton>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <ResultMessage result={save.result} />
      {canManage && (
        <form className="grid gap-2 rounded-xl border border-dashed border-lavender-300 bg-white/50 p-3 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); void save.run({ kind, programId, code: draft.code, title: draft.title, description: draft.description, target: draft.target === "" ? null : Number(draft.target) }).then((r) => r.ok && setDraft({ ...blank, code: `${kind}${items.length + 2}` })); }}>
          <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} aria-label="New code" />
          <Input className="md:col-span-4" required placeholder={`${kind} title`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Input type="number" placeholder="Target %" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          <Textarea className="md:col-span-5" required placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <Button disabled={save.pending} className="self-end"><Plus /> Add {kind}</Button>
        </form>
      )}
    </div>
  );
}

export function CreateCourseForm({ programId }: { programId: string }) {
  const init = { code: "", name: "", semesterNumber: 3, credits: 4, lectureHours: 3, tutorialHours: 1, practicalHours: 0, courseType: "THEORY" as const, category: "PC" as const };
  const [f, setF] = useState(init);
  const { run, pending, result } = useServerAction(createCourseAction);
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <form className="grid gap-3 md:grid-cols-8" onSubmit={(e) => { e.preventDefault(); void run({ programId, ...f }).then((r) => r.ok && setF(init)); }}>
      <Field label="Course code"><Input required placeholder="ME301" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
      <Field label="Course name" className="md:col-span-3"><Input required placeholder="Engineering Mechanics" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Semester"><Input type="number" min={1} max={14} value={f.semesterNumber} onChange={num("semesterNumber")} /></Field>
      <Field label="Credits"><Input type="number" min={0} step="0.5" value={f.credits} onChange={num("credits")} /></Field>
      <Field label="Type"><Select value={f.courseType} onChange={(e) => setF({ ...f, courseType: e.target.value as "THEORY" })}>{["THEORY", "LAB", "INTEGRATED", "PROJECT", "SEMINAR"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as "PC" })}>{["BS", "ES", "HS", "PC", "PE", "OE", "PROJ", "MC"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="L"><Input type="number" min={0} value={f.lectureHours} onChange={num("lectureHours")} /></Field>
      <Field label="T"><Input type="number" min={0} value={f.tutorialHours} onChange={num("tutorialHours")} /></Field>
      <Field label="P"><Input type="number" min={0} value={f.practicalHours} onChange={num("practicalHours")} /></Field>
      <div className="flex items-end md:col-span-2"><Button disabled={pending}><Plus /> Create course</Button></div>
      <ResultMessage result={result} className="md:col-span-8" />
    </form>
  );
}
