import { describe, expect, it } from "vitest";
import { detectColumns, validateMarksRows, type MarksValidationContext } from "@/lib/domain/marks";

const ctx: MarksValidationContext = {
  courseCode: "ME301",
  students: new Map([
    ["me001", { id: "s1", name: "Asha Rao" }],
    ["me002", { id: "s2", name: "Vikram Singh" }],
    ["me099", { id: "s9", name: "Other Batch" }],
  ]),
  enrolledStudentIds: new Set(["s1", "s2"]),
  assessments: new Map([
    ["mid term", { id: "a1", name: "Mid Term", questions: new Map([
      ["q1", { id: "q1", label: "Q1", maxMarks: 10, mapped: true }],
      ["q2", { id: "q2", label: "Q2", maxMarks: 10, mapped: false }],
    ]) }],
  ]),
};
const row = (rowNumber: number, v: Record<string, unknown>) => ({ rowNumber, values: v });

describe("marks column detection", () => {
  it("detects common header names", () => {
    expect(detectColumns(["Roll No", "Name", "Exam", "Q No", "Score"])).toEqual({
      studentId: "Roll No", studentName: "Name", assessment: "Exam", question: "Q No", marks: "Score",
    });
    expect(detectColumns(["Student ID", "Student Name", "Assessment", "Question", "Marks", "Course Code"]).courseCode).toBe("Course Code");
  });
});

describe("marks validation", () => {
  it("accepts valid rows and reports missing students", () => {
    const r = validateMarksRows([row(2, { studentId: "ME001", studentName: "Asha Rao", assessment: "Mid Term", question: "Q1", marks: 8 })], ctx);
    expect(r.errors).toHaveLength(0);
    expect(r.valid).toEqual([{ row: 2, studentId: "s1", questionId: "q1", marks: 8 }]);
    expect(r.summary.missingStudents).toEqual(["ME002"]);
    expect(r.warnings.some((w) => w.message.includes("no marks"))).toBe(true);
  });

  it("rejects every invalid case explicitly", () => {
    const r = validateMarksRows([
      row(2, { studentId: "ME001", assessment: "Mid Term", question: "Q1", marks: 11 }), // > max
      row(3, { studentId: "ME001", assessment: "Mid Term", question: "Q1", marks: "abc" }), // invalid
      row(4, { studentId: "ME777", assessment: "Mid Term", question: "Q1", marks: 5 }), // unknown student
      row(5, { studentId: "ME099", assessment: "Mid Term", question: "Q1", marks: 5 }), // not enrolled
      row(6, { studentId: "ME002", assessment: "Quiz 9", question: "Q1", marks: 5 }), // missing assessment
      row(7, { studentId: "ME002", assessment: "Mid Term", question: "Q2", marks: 5 }), // no CO mapping
      row(8, { studentId: "ME002", assessment: "Mid Term", question: "Q1", marks: 5 }),
      row(9, { studentId: "ME002", assessment: "Mid Term", question: "Q1", marks: 6 }), // duplicate
      row(10, { studentId: "ME002", assessment: "Mid Term", question: "Q1", marks: -1, courseCode: "ME302" }), // unknown course
      row(11, { studentId: "", assessment: "Mid Term", question: "Q1", marks: 3 }), // missing id
      row(12, { studentId: "ME002", assessment: "Mid Term", question: "Q7", marks: 3 }), // unknown question
    ], ctx);
    const byRow = Object.fromEntries(r.errors.map((e) => [e.row, e.message]));
    expect(byRow[2]).toMatch(/exceed maximum 10/);
    expect(byRow[3]).toMatch(/Invalid marks/);
    expect(byRow[4]).toMatch(/Unknown student/);
    expect(byRow[5]).toMatch(/not enrolled/);
    expect(byRow[6]).toMatch(/Missing assessment/);
    expect(byRow[7]).toMatch(/no CO mapping/);
    expect(byRow[9]).toMatch(/Duplicate/);
    expect(byRow[10]).toMatch(/Unknown course/);
    expect(byRow[11]).toMatch(/Missing Student ID/);
    expect(byRow[12]).toMatch(/does not exist/);
    expect(r.valid).toHaveLength(1);
    expect(r.summary.errorRows).toBe(10);
  });

  it("warns on name mismatch but accepts the record", () => {
    const r = validateMarksRows([row(2, { studentId: "me002", studentName: "V. Singh", assessment: "mid term", question: "q1", marks: "7.5" })], ctx);
    expect(r.errors).toHaveLength(0);
    expect(r.valid[0].marks).toBe(7.5);
    expect(r.warnings[0].message).toMatch(/differs/);
  });
});
