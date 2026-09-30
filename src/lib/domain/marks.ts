/**
 * Marks upload parsing & validation (pure). Used by the server action as the
 * authoritative validator; the client uses detectColumns for the mapping UI.
 * Invalid records are never silently accepted: any error blocks the save.
 */

export const MARKS_FIELDS = ["studentId", "studentName", "assessment", "question", "marks", "courseCode"] as const;
export type MarksField = (typeof MARKS_FIELDS)[number];
export const REQUIRED_MARKS_FIELDS: MarksField[] = ["studentId", "assessment", "question", "marks"];

export const MARKS_FIELD_LABELS: Record<MarksField, string> = {
  studentId: "Student ID",
  studentName: "Student Name",
  assessment: "Assessment",
  question: "Question",
  marks: "Marks",
  courseCode: "Course Code (optional)",
};

const SYNONYMS: Record<MarksField, string[]> = {
  studentId: ["student id", "studentid", "roll no", "roll number", "rollno", "roll", "prn", "enrollment no", "enrolment no", "usn", "register no", "reg no", "id"],
  studentName: ["student name", "name", "studentname", "full name"],
  assessment: ["assessment", "exam", "assessment name", "test", "component"],
  question: ["question", "q", "q no", "question no", "question number", "qno", "item"],
  marks: ["marks", "mark", "score", "marks obtained", "obtained"],
  courseCode: ["course", "course code", "coursecode", "subject code"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();

export function detectColumns(headers: string[]): Partial<Record<MarksField, string>> {
  const out: Partial<Record<MarksField, string>> = {};
  const used = new Set<string>();
  for (const field of MARKS_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(norm(h)));
    if (hit) {
      out[field] = hit;
      used.add(hit);
    }
  }
  return out;
}

export type MarksCell = string | number | null | undefined;
export interface MarksRowRaw { rowNumber: number; values: Partial<Record<MarksField, MarksCell>> }

export interface MarksValidationContext {
  courseCode: string;
  /** roll no (case-insensitive) → student */
  students: Map<string, { id: string; name: string }>;
  enrolledStudentIds: Set<string>;
  /** assessment name (case-insensitive) → questions label (case-insensitive) */
  assessments: Map<string, { id: string; name: string; questions: Map<string, { id: string; label: string; maxMarks: number; mapped: boolean }> }>;
}

export interface MarksIssue { row: number; field: MarksField | "row"; message: string }
export interface ValidMark { row: number; studentId: string; questionId: string; marks: number }

export interface MarksValidationResult {
  valid: ValidMark[];
  errors: MarksIssue[];
  warnings: MarksIssue[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    studentsInFile: number;
    missingStudents: string[];
    questionsCovered: number;
  };
}

const key = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function validateMarksRows(rows: MarksRowRaw[], ctx: MarksValidationContext): MarksValidationResult {
  const errors: MarksIssue[] = [];
  const warnings: MarksIssue[] = [];
  const valid: ValidMark[] = [];
  const seen = new Map<string, number>();
  const studentsInFile = new Set<string>();
  const questionsCovered = new Set<string>();
  const errorRows = new Set<number>();
  const err = (row: number, field: MarksIssue["field"], message: string) => {
    errors.push({ row, field, message });
    errorRows.add(row);
  };

  for (const r of rows) {
    const v = r.values;
    const empty = MARKS_FIELDS.every((f) => v[f] === undefined || v[f] === null || String(v[f]).trim() === "");
    if (empty) continue;

    let bad = false;
    for (const f of REQUIRED_MARKS_FIELDS) {
      if (v[f] === undefined || v[f] === null || String(v[f]).trim() === "") {
        err(r.rowNumber, f, `Missing ${f === "studentId" ? "Student ID" : f}`);
        bad = true;
      }
    }
    if (bad) continue;

    if (v.courseCode !== undefined && String(v.courseCode).trim() !== "" && key(v.courseCode) !== key(ctx.courseCode)) {
      err(r.rowNumber, "courseCode", `Unknown course "${String(v.courseCode)}" — this upload is for ${ctx.courseCode}`);
      continue;
    }

    const student = ctx.students.get(key(v.studentId));
    if (!student) {
      err(r.rowNumber, "studentId", `Unknown student "${String(v.studentId)}"`);
      continue;
    }
    if (!ctx.enrolledStudentIds.has(student.id)) {
      err(r.rowNumber, "studentId", `Student ${String(v.studentId)} is not enrolled in ${ctx.courseCode}`);
      continue;
    }
    if (v.studentName !== undefined && String(v.studentName).trim() !== "" && key(v.studentName) !== key(student.name)) {
      warnings.push({ row: r.rowNumber, field: "studentName", message: `Name "${String(v.studentName)}" differs from records ("${student.name}")` });
    }

    const assessment = ctx.assessments.get(key(v.assessment));
    if (!assessment) {
      err(r.rowNumber, "assessment", `Missing assessment "${String(v.assessment)}" — not defined in the assessment plan`);
      continue;
    }
    const question = assessment.questions.get(key(v.question));
    if (!question) {
      err(r.rowNumber, "question", `Question "${String(v.question)}" does not exist in ${assessment.name}`);
      continue;
    }
    if (!question.mapped) {
      err(r.rowNumber, "question", `${assessment.name} ${question.label} has no CO mapping`);
      continue;
    }

    const rawMarks = typeof v.marks === "number" ? v.marks : String(v.marks).trim();
    const marks = typeof rawMarks === "number" ? rawMarks : Number(rawMarks);
    if (typeof rawMarks === "string" && !/^-?\d+(\.\d+)?$/.test(rawMarks)) {
      err(r.rowNumber, "marks", `Invalid marks "${String(v.marks)}"`);
      continue;
    }
    if (!Number.isFinite(marks) || marks < 0) {
      err(r.rowNumber, "marks", `Invalid marks "${String(v.marks)}" — must be a non-negative number`);
      continue;
    }
    if (marks > question.maxMarks) {
      err(r.rowNumber, "marks", `Marks ${marks} exceed maximum ${question.maxMarks} for ${assessment.name} ${question.label}`);
      continue;
    }

    const dupKey = `${student.id}|${question.id}`;
    if (seen.has(dupKey)) {
      err(r.rowNumber, "row", `Duplicate entry for ${String(v.studentId)} / ${assessment.name} ${question.label} (first at row ${seen.get(dupKey)})`);
      continue;
    }
    seen.set(dupKey, r.rowNumber);
    studentsInFile.add(student.id);
    questionsCovered.add(question.id);
    valid.push({ row: r.rowNumber, studentId: student.id, questionId: question.id, marks: Math.round(marks * 100) / 100 });
  }

  const idToRoll = new Map<string, string>();
  for (const [roll, s] of ctx.students) idToRoll.set(s.id, roll.toUpperCase());
  const missingStudents = [...ctx.enrolledStudentIds].filter((id) => !studentsInFile.has(id)).map((id) => idToRoll.get(id) ?? id);
  if (missingStudents.length > 0) {
    warnings.push({ row: 0, field: "studentId", message: `${missingStudents.length} enrolled student(s) have no marks in this file: ${missingStudents.slice(0, 10).join(", ")}${missingStudents.length > 10 ? "…" : ""}` });
  }

  const nonEmpty = rows.filter((r) => !MARKS_FIELDS.every((f) => r.values[f] === undefined || String(r.values[f] ?? "").trim() === "")).length;
  return {
    valid,
    errors,
    warnings,
    summary: {
      totalRows: nonEmpty,
      validRows: valid.length,
      errorRows: errorRows.size,
      studentsInFile: studentsInFile.size,
      missingStudents,
      questionsCovered: questionsCovered.size,
    },
  };
}
