import { describe, expect, it } from "vitest";
import {
  aggregateProgramAttainment, classifyGap, computeDirectAttainment, computeFinalAttainment, computeIndirectAttainment,
  computeOutcomeContribution, levelFor, resolveTarget, type CoInput,
} from "@/lib/domain/attainment";
import { DEFAULT_METHODOLOGY, methodologySchema, type Methodology } from "@/lib/domain/methodology";

const m: Methodology = { ...DEFAULT_METHODOLOGY };
const cos: CoInput[] = [
  { id: "co1", code: "CO1", target: 60, targetSource: "CO" },
  { id: "co2", code: "CO2", target: 70, targetSource: "COURSE" },
];

describe("direct attainment", () => {
  it("reproduces the spec example: 42 of 58 students meeting threshold = 72.41%, gap +12.41, Achieved", () => {
    const students = Array.from({ length: 58 }, (_, i) => `s${i}`);
    const marks = students.map((s, i) => ({ studentId: s, questionId: "q1", marks: i < 42 ? 7 : 4 }));
    const [r] = computeDirectAttainment(
      { cos: [cos[0]], assessments: [{ id: "a", name: "Mid", weightage: 100 }], questions: [{ id: "q1", assessmentId: "a", label: "Q1", maxMarks: 10, coIds: ["co1"] }], marks },
      m,
    );
    expect(r.studentsAssessed).toBe(58);
    expect(r.studentsMeeting).toBe(42);
    expect(r.achievementPct).toBe(72.41);
    expect(r.gap).toBe(12.41);
    expect(r.status).toBe("ACHIEVED");
    expect(r.level).toBe(3);
    expect(r.formula).toContain("42 ÷ 58");
  });

  it("pools marks across questions and excludes unattempted questions from the denominator", () => {
    const questions = [
      { id: "q1", assessmentId: "a", label: "Q1", maxMarks: 10, coIds: ["co1"] },
      { id: "q2", assessmentId: "a", label: "Q2", maxMarks: 10, coIds: ["co1", "co2"] },
    ];
    const marks = [
      { studentId: "s1", questionId: "q1", marks: 6 }, { studentId: "s1", questionId: "q2", marks: 5 }, // 11/20 = 55% (fails CO1)
      { studentId: "s2", questionId: "q1", marks: 6 }, // only q1 attempted: 6/10 = 60% (meets exactly)
    ];
    const res = computeDirectAttainment({ cos, assessments: [{ id: "a", name: "Mid", weightage: 0 }], questions, marks }, m);
    expect(res[0].studentsAssessed).toBe(2);
    expect(res[0].studentsMeeting).toBe(1);
    expect(res[0].achievementPct).toBe(50);
    // CO2 only assessed via q2 → s1 scored 50%, s2 not assessed
    expect(res[1].studentsAssessed).toBe(1);
    expect(res[1].achievementPct).toBe(0);
    expect(res[1].status).toBe("CRITICAL");
  });

  it("supports assessment-weightage weighting", () => {
    const questions = [
      { id: "q1", assessmentId: "mid", label: "Q1", maxMarks: 10, coIds: ["co1"] },
      { id: "q2", assessmentId: "end", label: "Q1", maxMarks: 100, coIds: ["co1"] },
    ];
    // mid 100%, end 40%. MARKS: 50/110 = 45.45% (fail). Weighted 30/70: 0.3*100+0.7*40 = 58 (fail). 50/50: 70 (pass)
    const marks = [{ studentId: "s", questionId: "q1", marks: 10 }, { studentId: "s", questionId: "q2", marks: 40 }];
    const base = { cos: [cos[0]], questions, marks };
    const w = { ...m, assessment_weighting: "ASSESSMENT_WEIGHTAGE" as const };
    expect(computeDirectAttainment({ ...base, assessments: [{ id: "mid", name: "Mid", weightage: 30 }, { id: "end", name: "End", weightage: 70 }] }, w)[0].studentsMeeting).toBe(0);
    expect(computeDirectAttainment({ ...base, assessments: [{ id: "mid", name: "Mid", weightage: 50 }, { id: "end", name: "End", weightage: 50 }] }, w)[0].studentsMeeting).toBe(1);
    expect(computeDirectAttainment({ ...base, assessments: [{ id: "mid", name: "Mid", weightage: 50 }, { id: "end", name: "End", weightage: 50 }] }, m)[0].studentsMeeting).toBe(0);
  });

  it("returns INCOMPLETE when a CO has no marks", () => {
    const [r] = computeDirectAttainment({ cos: [cos[0]], assessments: [], questions: [], marks: [] }, m);
    expect(r.achievementPct).toBeNull();
    expect(r.status).toBe("INCOMPLETE");
  });
});

describe("indirect attainment", () => {
  it("scales mean rating to percentage (4.2 / 5 = 84%)", () => {
    const responses = [5, 4, 4, 4, 4].map((rating) => ({ questionId: "f1", rating }));
    const [r] = computeIndirectAttainment({ cos: [cos[0]], questions: [{ id: "f1", coId: "co1" }], responses, scaleMax: 5 }, m);
    expect(r.meanRating).toBe(4.2);
    expect(r.indirectPct).toBe(84);
    expect(r.respondents).toBe(5);
  });
  it("supports percent-agree method", () => {
    const responses = [5, 4, 3, 2].map((rating) => ({ questionId: "f1", rating }));
    const [r] = computeIndirectAttainment({ cos: [cos[0]], questions: [{ id: "f1", coId: "co1" }], responses, scaleMax: 5 }, { ...m, indirect_method: "PERCENT_AGREE", indirect_agree_min: 4 });
    expect(r.indirectPct).toBe(50);
  });
});

describe("final attainment", () => {
  const direct = [{ coId: "co1", achievementPct: 72 }, { coId: "co2", achievementPct: 72 }] as never;
  const indirect = [{ coId: "co1", indirectPct: 84 }, { coId: "co2", indirectPct: 81 }] as never;
  it("uses the configured 80/20 weights (72×0.8 + 84×0.2 = 74.4)", () => {
    const [f1, f2] = computeFinalAttainment(cos, direct, indirect, m);
    expect(f1.finalPct).toBe(74.4);
    expect(f1.formula).toContain("72 × 0.80 + 84 × 0.20 = 74.40%");
    expect(f2.finalPct).toBe(73.8);
    expect(f2.gap).toBe(3.8);
    expect(f2.status).toBe("ACHIEVED");
  });
  it("never hard-codes the split (70/30)", () => {
    const [f1] = computeFinalAttainment(cos, direct, indirect, { ...m, direct_weight: 70, indirect_weight: 30 });
    expect(f1.finalPct).toBe(75.6);
  });
  it("is INCOMPLETE without feedback when indirect weight > 0", () => {
    const [f1] = computeFinalAttainment(cos, direct, [] as never, m);
    expect(f1.finalPct).toBeNull();
    expect(f1.status).toBe("INCOMPLETE");
  });
  it("allows 100/0 direct-only methodology", () => {
    const [f1] = computeFinalAttainment(cos, direct, [] as never, { ...m, direct_weight: 100, indirect_weight: 0 });
    expect(f1.finalPct).toBe(72);
  });
});

describe("PO/PSO contribution and program aggregation", () => {
  const finals = [
    { coId: "co1", coCode: "CO1", finalPct: 80 },
    { coId: "co2", coCode: "CO2", finalPct: 50 },
  ] as never;
  it("weights CO attainment by correlation strength", () => {
    const [po1, po2, po3] = computeOutcomeContribution(
      finals,
      [{ coId: "co1", outcomeId: "po1", value: 3 }, { coId: "co2", outcomeId: "po1", value: 1 }, { coId: "co2", outcomeId: "po2", value: 2 }, { coId: "co1", outcomeId: "po3", value: 0 }],
      [{ id: "po1", code: "PO1" }, { id: "po2", code: "PO2" }, { id: "po3", code: "PO3" }],
      m,
    );
    expect(po1.valuePct).toBe(72.5); // (80*3 + 50*1)/4
    expect(po1.mappingSum).toBe(4);
    expect(po2.valuePct).toBe(50);
    expect(po3.valuePct).toBeNull();
  });
  it("aggregates courses by the configured method", () => {
    const courses = [
      { offeringId: "o1", courseCode: "ME301", credits: 4, locked: true, values: { po1: { valuePct: 80, mappingSum: 6 } } },
      { offeringId: "o2", courseCode: "ME302", credits: 2, locked: false, values: { po1: { valuePct: 50, mappingSum: 2 } } },
    ];
    const outcomes = [{ id: "po1", code: "PO1", target: 70 }];
    expect(aggregateProgramAttainment(courses, outcomes, { ...m, program_aggregation: "COURSE_WEIGHTED" })[0].valuePct).toBe(65);
    expect(aggregateProgramAttainment(courses, outcomes, { ...m, program_aggregation: "CREDIT_WEIGHTED" })[0].valuePct).toBe(70);
    const mw = aggregateProgramAttainment(courses, outcomes, { ...m, program_aggregation: "MAPPING_WEIGHTED" })[0];
    expect(mw.valuePct).toBe(72.5);
    expect(mw.gap).toBe(2.5);
    const lockedOnly = aggregateProgramAttainment(courses, outcomes, { ...m, program_scope: "LOCKED_ONLY" })[0];
    expect(lockedOnly.valuePct).toBe(80);
    expect(lockedOnly.contributing).toHaveLength(1);
  });
});

describe("gap classification, levels, targets, methodology validation", () => {
  it("classifies gaps with configurable margins", () => {
    expect(classifyGap(0, m)).toBe("ACHIEVED");
    expect(classifyGap(-5, m)).toBe("NEAR_TARGET");
    expect(classifyGap(-9, m)).toBe("BELOW_TARGET");
    expect(classifyGap(-15.01, m)).toBe("CRITICAL");
    expect(classifyGap(-9, { near_target_margin: 10, critical_margin: 20 })).toBe("NEAR_TARGET");
    expect(classifyGap(null, m)).toBe("INCOMPLETE");
  });
  it("derives attainment levels from bands", () => {
    expect(levelFor(75, m)).toBe(3);
    expect(levelFor(60, m)).toBe(2);
    expect(levelFor(49.99, m)).toBe(0);
  });
  it("resolves the target hierarchy CO → course → program → institution", () => {
    expect(resolveTarget({ co: 65, course: 70, program: 55, institution: 60 })).toEqual({ target: 65, source: "CO" });
    expect(resolveTarget({ course: 70, program: 55, institution: 60 })).toEqual({ target: 70, source: "COURSE" });
    expect(resolveTarget({ program: 55, institution: 60 })).toEqual({ target: 55, source: "PROGRAM" });
    expect(resolveTarget({ institution: 60 })).toEqual({ target: 60, source: "INSTITUTION" });
  });
  it("rejects weights that do not sum to 100", () => {
    expect(methodologySchema.safeParse({ ...m, direct_weight: 70, indirect_weight: 20 }).success).toBe(false);
    expect(methodologySchema.safeParse({ ...m, direct_weight: 60, indirect_weight: 40 }).success).toBe(true);
  });
});
