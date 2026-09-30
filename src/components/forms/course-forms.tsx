"use client";
import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { allocateFacultyAction, assignCourseCoordinatorAction, deactivateAssignmentAction, removeCourseCoordinatorAction } from "@/app/actions/academic";
import { Button } from "@/components/ui/button";
import { ActionButton, ResultMessage, useServerAction } from "@/components/ui/action";
import { Field, Input, Select } from "@/components/ui/primitives";
import { AssignCoordinator } from "./program-forms";

type Staff = { id: string; full_name: string; department_code: string | null };

export function AssignCourseCoordinator({ courseId, staff }: { courseId: string; staff: Staff[] }) {
  return <AssignCoordinator staff={staff} label="Assign Course Coordinator" onAssign={(u) => assignCourseCoordinatorAction(courseId, u)} />;
}
export function RemoveCcButton({ courseId, userId }: { courseId: string; userId: string }) {
  return <ActionButton size="sm" variant="ghost" confirm="Remove this course coordinator?" action={() => removeCourseCoordinatorAction(courseId, userId)}>Remove</ActionButton>;
}
export function RemoveAssignmentButton({ courseId, assignmentId }: { courseId: string; assignmentId: string }) {
  return <ActionButton size="sm" variant="ghost" confirm="Remove this faculty allocation?" action={() => deactivateAssignmentAction(courseId, assignmentId)}>Remove</ActionButton>;
}

export function AllocateFacultyForm(props: {
  courseId: string;
  staff: Staff[];
  years: { id: string; name: string; is_current: boolean }[];
  semesters: { id: string; name: string; academic_year_id: string }[];
  batches: { id: string; name: string; department_id: string | null }[];
  departmentId: string;
}) {
  const current = props.years.find((y) => y.is_current) ?? props.years[0];
  const batches = props.batches.filter((b) => !b.department_id || b.department_id === props.departmentId);
  const [f, setF] = useState({
    facultyId: "", academicYearId: current?.id ?? "", semesterId: "", batchId: batches[0]?.id ?? "", section: "A",
    courseRole: "COURSE_INSTRUCTOR" as "COURSE_INSTRUCTOR" | "COURSE_COORDINATOR" | "LAB_INSTRUCTOR" | "CO_INSTRUCTOR", deadline: "",
  });
  const sems = useMemo(() => props.semesters.filter((s) => s.academic_year_id === f.academicYearId), [props.semesters, f.academicYearId]);
  const semesterId = f.semesterId || sems[0]?.id || "";
  const { run, pending, result } = useServerAction(allocateFacultyAction);
  return (
    <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run({ courseId: props.courseId, ...f, semesterId, deadline: f.deadline || null }); }}>
      <Field label="Faculty" className="md:col-span-2">
        <Select required value={f.facultyId} onChange={(e) => setF({ ...f, facultyId: e.target.value })}>
          <option value="">Select faculty…</option>
          {props.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.department_code ? ` (${s.department_code})` : ""}</option>)}
        </Select>
      </Field>
      <Field label="Course role">
        <Select value={f.courseRole} onChange={(e) => setF({ ...f, courseRole: e.target.value as typeof f.courseRole })}>
          <option value="COURSE_INSTRUCTOR">Course Instructor</option>
          <option value="COURSE_COORDINATOR">Course Coordinator</option>
          <option value="LAB_INSTRUCTOR">Lab Instructor</option>
          <option value="CO_INSTRUCTOR">Co-Instructor</option>
        </Select>
      </Field>
      <Field label="Setup deadline"><Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
      <Field label="Academic year">
        <Select value={f.academicYearId} onChange={(e) => setF({ ...f, academicYearId: e.target.value, semesterId: "" })}>{props.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select>
      </Field>
      <Field label="Semester">
        <Select value={semesterId} onChange={(e) => setF({ ...f, semesterId: e.target.value })}>{sems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      </Field>
      <Field label="Batch">
        <Select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
      </Field>
      <Field label="Section"><Input required maxLength={10} value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} /></Field>
      <div className="md:col-span-4 flex items-center gap-3">
        <Button disabled={pending || !f.facultyId}><UserPlus /> Allocate Faculty</Button>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
