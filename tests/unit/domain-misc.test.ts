import { describe, expect, it } from "vitest";
import { checkMeasurability } from "@/lib/domain/bloom";
import { computeCompletion, DEFAULT_COMPLETION_WEIGHTS, submissionChecklist } from "@/lib/domain/completion";
import { can, ROLE_PERMISSIONS, ROLES } from "@/lib/rbac";

describe("Bloom measurability", () => {
  it("accepts measurable action verbs and detects level", () => {
    const r = checkMeasurability("Apply principles of engineering mechanics to solve mechanical system problems.");
    expect(r.measurable).toBe(true);
    expect(r.detectedLevel).toBe("APPLY");
  });
  it("flags non-measurable verbs", () => {
    const r = checkMeasurability("Understand the basics of thermodynamics and its laws");
    expect(r.measurable).toBe(false);
    expect(r.issues.join(" ")).toMatch(/not directly measurable/);
  });
  it("flags a declared level that mismatches the verb", () => {
    const r = checkMeasurability("Design a gear train for a given speed ratio requirement", "REMEMBER");
    expect(r.detectedLevel).toBe("CREATE");
    expect(r.issues.join(" ")).toMatch(/differs/);
  });
});

describe("completion scoring", () => {
  it("uses configurable weights and lists missing items", () => {
    const all = Object.fromEntries(Object.keys(DEFAULT_COMPLETION_WEIGHTS).map((k) => [k, true]));
    expect(computeCompletion(all, DEFAULT_COMPLETION_WEIGHTS).percent).toBe(100);
    const r = computeCompletion({ ...all, co_pso: false, question_mapping: false }, DEFAULT_COMPLETION_WEIGHTS);
    expect(r.percent).toBe(90);
    expect(r.missing.map((x) => x.label)).toEqual(["CO-PSO Matrix", "Question Mapping"]);
    expect(computeCompletion({}, DEFAULT_COMPLETION_WEIGHTS).percent).toBe(0);
    expect(computeCompletion({ syllabus: true }, { syllabus: 1, cos: 1 }).percent).toBe(50);
  });
  it("builds the submission checklist", () => {
    const items = submissionChecklist({ profile: true });
    expect(items.find((i) => i.key === "profile")?.done).toBe(true);
    expect(items.find((i) => i.key === "evidence")?.done).toBe(false);
    expect(items).toHaveLength(20);
  });
});

describe("RBAC matrix", () => {
  it("defines permissions for every role", () => {
    for (const r of ROLES) expect(ROLE_PERMISSIONS[r]).toBeDefined();
  });
  it("enforces key separations of duty", () => {
    expect(can({ roles: ["HOD"] }, "program.create")).toBe(true);
    expect(can({ roles: ["HOD"] }, "marks.edit")).toBe(false);
    expect(can({ roles: ["PROGRAM_COORDINATOR"] }, "program.create")).toBe(false);
    expect(can({ roles: ["PROGRAM_COORDINATOR"] }, "course.create")).toBe(true);
    expect(can({ roles: ["FACULTY"] }, "course.allocate")).toBe(false);
    expect(can({ roles: ["COURSE_COORDINATOR"] }, "course.allocate")).toBe(true);
    expect(can({ roles: ["STUDENT"] }, "course.workspace")).toBe(false);
    expect(can({ roles: ["REVIEWER"] }, "course.review")).toBe(false);
    expect(can({ roles: ["IQAC_ADMIN"] }, "dashboard.institution")).toBe(true);
  });
});
