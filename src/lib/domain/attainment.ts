/**
 * OBE attainment calculation engine — pure, deterministic, side-effect free.
 * Every result carries the formula text and the inputs used so that any value
 * shown in the UI or exported can be traced ("View Calculation").
 */
import type { Methodology } from "./methodology";

export const ENGINE_VERSION = "1.0.0";

export type GapClass = "ACHIEVED" | "NEAR_TARGET" | "BELOW_TARGET" | "CRITICAL" | "INCOMPLETE";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => (Number.isInteger(round2(n)) ? String(round2(n)) : round2(n).toFixed(2));

export function levelFor(pct: number | null, m: Pick<Methodology, "level_bands">): number | null {
  if (pct === null || Number.isNaN(pct)) return null;
  const bands = [...m.level_bands].sort((a, b) => b.min - a.min);
  for (const b of bands) if (pct >= b.min) return b.level;
  return 0;
}

export function classifyGap(gap: number | null, m: Pick<Methodology, "near_target_margin" | "critical_margin">): GapClass {
  if (gap === null || Number.isNaN(gap)) return "INCOMPLETE";
  const g = round2(gap);
  if (g >= 0) return "ACHIEVED";
  if (g >= -m.near_target_margin) return "NEAR_TARGET";
  if (g >= -m.critical_margin) return "BELOW_TARGET";
  return "CRITICAL";
}

// ---------------------------------------------------------------------------
// Direct attainment
// ---------------------------------------------------------------------------
export interface CoInput { id: string; code: string; target: number; targetSource: string }
export interface AssessmentInput { id: string; name: string; weightage: number }
export interface QuestionInput { id: string; assessmentId: string; label: string; maxMarks: number; coIds: string[] }
export interface MarkInput { studentId: string; questionId: string; marks: number }

export interface DirectCoResult {
  coId: string;
  coCode: string;
  studentsAssessed: number;
  studentsMeeting: number;
  averageScorePct: number | null;
  achievementPct: number | null;
  level: number | null;
  thresholdPct: number;
  targetPct: number;
  targetSource: string;
  gap: number | null;
  status: GapClass;
  formula: string;
  inputs: {
    questions: { label: string; assessment: string; maxMarks: number }[];
    weighting: Methodology["assessment_weighting"];
    assessmentWeights?: Record<string, number>;
    distribution: { band: string; count: number }[];
  };
}

/**
 * CO score of a student = marks obtained on questions mapped to the CO ÷ max
 * marks of those questions × 100 (only questions for which the student has a
 * mark record — absent/unattempted questions are excluded from the denominator).
 * With ASSESSMENT_WEIGHTAGE the per-assessment CO percentages are combined by
 * assessment weightage. A question mapped to several COs counts fully toward each.
 *
 * Achievement % = students with CO score ≥ threshold ÷ students assessed × 100.
 */
export function computeDirectAttainment(
  input: { cos: CoInput[]; assessments: AssessmentInput[]; questions: QuestionInput[]; marks: MarkInput[] },
  m: Methodology,
): DirectCoResult[] {
  const qById = new Map(input.questions.map((q) => [q.id, q]));
  const aById = new Map(input.assessments.map((a) => [a.id, a]));
  const marksByStudent = new Map<string, Map<string, number>>();
  for (const mk of input.marks) {
    if (!qById.has(mk.questionId)) continue;
    let s = marksByStudent.get(mk.studentId);
    if (!s) marksByStudent.set(mk.studentId, (s = new Map()));
    s.set(mk.questionId, mk.marks);
  }

  return input.cos.map((co) => {
    const coQuestions = input.questions.filter((q) => q.coIds.includes(co.id));
    const scores: number[] = [];
    for (const [, qm] of marksByStudent) {
      if (m.assessment_weighting === "MARKS") {
        let got = 0;
        let max = 0;
        for (const q of coQuestions) {
          if (!qm.has(q.id)) continue;
          got += qm.get(q.id)!;
          max += q.maxMarks;
        }
        if (max > 0) scores.push((got / max) * 100);
      } else {
        let wSum = 0;
        let acc = 0;
        const byAssessment = new Map<string, { got: number; max: number }>();
        for (const q of coQuestions) {
          if (!qm.has(q.id)) continue;
          const e = byAssessment.get(q.assessmentId) ?? { got: 0, max: 0 };
          e.got += qm.get(q.id)!;
          e.max += q.maxMarks;
          byAssessment.set(q.assessmentId, e);
        }
        for (const [aid, e] of byAssessment) {
          const w = aById.get(aid)?.weightage ?? 0;
          if (e.max <= 0 || w <= 0) continue;
          acc += w * ((e.got / e.max) * 100);
          wSum += w;
        }
        if (wSum > 0) scores.push(acc / wSum);
      }
    }
    const assessed = scores.length;
    const meeting = scores.filter((s) => s + 1e-9 >= m.student_threshold_pct).length;
    const achievement = assessed > 0 ? round2((meeting / assessed) * 100) : null;
    const avg = assessed > 0 ? round2(scores.reduce((a, b) => a + b, 0) / assessed) : null;
    const gap = achievement === null ? null : round2(achievement - co.target);
    const bands = [
      { band: "0–39%", count: scores.filter((s) => s < 40).length },
      { band: "40–59%", count: scores.filter((s) => s >= 40 && s < 60).length },
      { band: "60–79%", count: scores.filter((s) => s >= 60 && s < 80).length },
      { band: "80–100%", count: scores.filter((s) => s >= 80).length },
    ];
    const formula =
      achievement === null
        ? `No marks recorded for questions mapped to ${co.code}; attainment cannot be computed.`
        : `Achievement = students with ${co.code} score ≥ ${fmt(m.student_threshold_pct)}% ÷ students assessed × 100 = ${meeting} ÷ ${assessed} × 100 = ${fmt(achievement)}%` +
          ` · Gap = ${fmt(achievement)} − ${fmt(co.target)} (target) = ${gap! >= 0 ? "+" : ""}${fmt(gap!)}` +
          ` · ${m.assessment_weighting === "MARKS" ? "CO score = Σ marks on mapped questions ÷ Σ max marks × 100" : "CO score = Σ(assessment weightage × assessment CO%) ÷ Σ weightage"}`;
    return {
      coId: co.id,
      coCode: co.code,
      studentsAssessed: assessed,
      studentsMeeting: meeting,
      averageScorePct: avg,
      achievementPct: achievement,
      level: levelFor(achievement, m),
      thresholdPct: m.student_threshold_pct,
      targetPct: co.target,
      targetSource: co.targetSource,
      gap,
      status: classifyGap(gap, m),
      formula,
      inputs: {
        questions: coQuestions.map((q) => ({ label: q.label, assessment: aById.get(q.assessmentId)?.name ?? "?", maxMarks: q.maxMarks })),
        weighting: m.assessment_weighting,
        assessmentWeights:
          m.assessment_weighting === "ASSESSMENT_WEIGHTAGE"
            ? Object.fromEntries(input.assessments.map((a) => [a.name, a.weightage]))
            : undefined,
        distribution: bands,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Indirect attainment (course feedback)
// ---------------------------------------------------------------------------
export interface FeedbackQuestionInput { id: string; coId: string }
export interface FeedbackResponseInput { questionId: string; rating: number }

export interface IndirectCoResult {
  coId: string;
  coCode: string;
  respondents: number;
  meanRating: number | null;
  scaleMax: number;
  indirectPct: number | null;
  formula: string;
  inputs: { distribution: Record<string, number>; method: Methodology["indirect_method"]; agreeMin?: number };
}

export function computeIndirectAttainment(
  input: { cos: CoInput[]; questions: FeedbackQuestionInput[]; responses: FeedbackResponseInput[]; scaleMax: number },
  m: Methodology,
): IndirectCoResult[] {
  return input.cos.map((co) => {
    const qIds = new Set(input.questions.filter((q) => q.coId === co.id).map((q) => q.id));
    const ratings = input.responses.filter((r) => qIds.has(r.questionId)).map((r) => r.rating);
    const n = ratings.length;
    const distribution: Record<string, number> = {};
    for (let i = 1; i <= input.scaleMax; i++) distribution[String(i)] = ratings.filter((r) => r === i).length;
    if (n === 0) {
      return {
        coId: co.id, coCode: co.code, respondents: 0, meanRating: null, scaleMax: input.scaleMax, indirectPct: null,
        formula: `No feedback responses for ${co.code}.`, inputs: { distribution, method: m.indirect_method },
      };
    }
    const mean = ratings.reduce((a, b) => a + b, 0) / n;
    let pct: number;
    let formula: string;
    if (m.indirect_method === "MEAN_SCALED") {
      pct = round2((mean / input.scaleMax) * 100);
      formula = `Indirect = mean rating ÷ scale max × 100 = ${mean.toFixed(3)} ÷ ${input.scaleMax} × 100 = ${fmt(pct)}% (n = ${n})`;
    } else {
      const agree = ratings.filter((r) => r >= m.indirect_agree_min).length;
      pct = round2((agree / n) * 100);
      formula = `Indirect = responses rating ≥ ${m.indirect_agree_min} ÷ responses × 100 = ${agree} ÷ ${n} × 100 = ${fmt(pct)}%`;
    }
    return {
      coId: co.id, coCode: co.code, respondents: n, meanRating: Math.round(mean * 1000) / 1000, scaleMax: input.scaleMax,
      indirectPct: pct, formula,
      inputs: { distribution, method: m.indirect_method, agreeMin: m.indirect_method === "PERCENT_AGREE" ? m.indirect_agree_min : undefined },
    };
  });
}

// ---------------------------------------------------------------------------
// Final course (CO) attainment
// ---------------------------------------------------------------------------
export interface FinalCoResult {
  coId: string;
  coCode: string;
  directPct: number | null;
  indirectPct: number | null;
  directWeight: number;
  indirectWeight: number;
  finalPct: number | null;
  level: number | null;
  targetPct: number;
  gap: number | null;
  status: GapClass;
  formula: string;
}

export function computeFinalAttainment(
  cos: CoInput[],
  direct: DirectCoResult[],
  indirect: IndirectCoResult[],
  m: Methodology,
): FinalCoResult[] {
  const wd = m.direct_weight / 100;
  const wi = m.indirect_weight / 100;
  return cos.map((co) => {
    const d = direct.find((x) => x.coId === co.id)?.achievementPct ?? null;
    const i = indirect.find((x) => x.coId === co.id)?.indirectPct ?? null;
    const needsIndirect = wi > 0;
    const needsDirect = wd > 0;
    const incomplete = (needsDirect && d === null) || (needsIndirect && i === null);
    const final = incomplete ? null : round2((d ?? 0) * wd + (i ?? 0) * wi);
    const gap = final === null ? null : round2(final - co.target);
    const formula = incomplete
      ? `Incomplete: ${d === null && needsDirect ? "direct attainment missing" : ""}${d === null && needsDirect && i === null && needsIndirect ? " and " : ""}${i === null && needsIndirect ? "indirect (feedback) attainment missing" : ""}.`
      : `Final = Direct × ${wd.toFixed(2)} + Indirect × ${wi.toFixed(2)} = ${fmt(d ?? 0)} × ${wd.toFixed(2)} + ${fmt(i ?? 0)} × ${wi.toFixed(2)} = ${fmt(final!)}%` +
        ` · Gap = ${fmt(final!)} − ${fmt(co.target)} = ${gap! >= 0 ? "+" : ""}${fmt(gap!)}`;
    return {
      coId: co.id, coCode: co.code, directPct: d, indirectPct: i, directWeight: m.direct_weight, indirectWeight: m.indirect_weight,
      finalPct: final, level: levelFor(final, m), targetPct: co.target, gap, status: classifyGap(gap, m), formula,
    };
  });
}

// ---------------------------------------------------------------------------
// Course-level PO / PSO contribution
// ---------------------------------------------------------------------------
export interface OutcomeInput { id: string; code: string }
export interface MappingInput { coId: string; outcomeId: string; value: number }

export interface OutcomeContribution {
  outcomeId: string;
  outcomeCode: string;
  valuePct: number | null;
  level: number | null;
  mappingSum: number;
  formula: string;
  terms: { coCode: string; finalPct: number; mapping: number }[];
}

/** Outcome value = Σ(CO final × correlation) ÷ Σ correlation, over COs mapped with correlation > 0. */
export function computeOutcomeContribution(
  finals: FinalCoResult[],
  mappings: MappingInput[],
  outcomes: OutcomeInput[],
  m: Methodology,
): OutcomeContribution[] {
  return outcomes.map((o) => {
    const terms: OutcomeContribution["terms"] = [];
    for (const mp of mappings) {
      if (mp.outcomeId !== o.id || mp.value <= 0) continue;
      const f = finals.find((x) => x.coId === mp.coId);
      if (!f || f.finalPct === null) continue;
      terms.push({ coCode: f.coCode, finalPct: f.finalPct, mapping: mp.value });
    }
    const allMapped = mappings.filter((mp) => mp.outcomeId === o.id && mp.value > 0);
    const mappingSum = allMapped.reduce((a, b) => a + b.value, 0);
    if (terms.length === 0) {
      return {
        outcomeId: o.id, outcomeCode: o.code, valuePct: null, level: null, mappingSum,
        formula: mappingSum > 0 ? `${o.code}: mapped COs have no final attainment yet.` : `${o.code}: not mapped by any CO of this course.`,
        terms,
      };
    }
    const num = terms.reduce((a, t) => a + t.finalPct * t.mapping, 0);
    const den = terms.reduce((a, t) => a + t.mapping, 0);
    const v = round2(num / den);
    return {
      outcomeId: o.id, outcomeCode: o.code, valuePct: v, level: levelFor(v, m), mappingSum,
      formula: `${o.code} = Σ(CO final × correlation) ÷ Σ correlation = (${terms.map((t) => `${fmt(t.finalPct)}×${t.mapping}`).join(" + ")}) ÷ ${den} = ${fmt(v)}%`,
      terms,
    };
  });
}

// ---------------------------------------------------------------------------
// Program-level PO / PSO attainment
// ---------------------------------------------------------------------------
export interface ProgramCourseInput {
  offeringId: string;
  courseCode: string;
  credits: number;
  locked: boolean;
  values: Record<string, { valuePct: number | null; mappingSum: number }>;
}
export interface ProgramOutcomeInput { id: string; code: string; target: number }

export interface ProgramOutcomeResult {
  outcomeId: string;
  outcomeCode: string;
  valuePct: number | null;
  level: number | null;
  targetPct: number;
  gap: number | null;
  status: GapClass;
  formula: string;
  contributing: { offeringId: string; courseCode: string; valuePct: number; weight: number; locked: boolean }[];
}

export function aggregateProgramAttainment(
  courses: ProgramCourseInput[],
  outcomes: ProgramOutcomeInput[],
  m: Methodology,
): ProgramOutcomeResult[] {
  const eligible = courses.filter((c) => m.program_scope === "ALL_CALCULATED" || c.locked);
  return outcomes.map((o) => {
    const contributing: ProgramOutcomeResult["contributing"] = [];
    for (const c of eligible) {
      const v = c.values[o.id];
      if (!v || v.valuePct === null) continue;
      const weight =
        m.program_aggregation === "COURSE_WEIGHTED" ? 1 : m.program_aggregation === "CREDIT_WEIGHTED" ? c.credits : v.mappingSum;
      if (weight <= 0) continue;
      contributing.push({ offeringId: c.offeringId, courseCode: c.courseCode, valuePct: v.valuePct, weight, locked: c.locked });
    }
    if (contributing.length === 0) {
      return {
        outcomeId: o.id, outcomeCode: o.code, valuePct: null, level: null, targetPct: o.target, gap: null, status: "INCOMPLETE",
        formula: `${o.code}: no contributing course attainment available.`, contributing,
      };
    }
    const num = contributing.reduce((a, c) => a + c.valuePct * c.weight, 0);
    const den = contributing.reduce((a, c) => a + c.weight, 0);
    const v = round2(num / den);
    const gap = round2(v - o.target);
    const wLabel = m.program_aggregation === "COURSE_WEIGHTED" ? "1" : m.program_aggregation === "CREDIT_WEIGHTED" ? "credits" : "Σ correlation";
    return {
      outcomeId: o.id, outcomeCode: o.code, valuePct: v, level: levelFor(v, m), targetPct: o.target, gap, status: classifyGap(gap, m),
      formula: `${o.code} = Σ(course value × ${wLabel}) ÷ Σ ${wLabel} = (${contributing.map((c) => `${c.courseCode} ${fmt(c.valuePct)}×${fmt(c.weight)}`).join(" + ")}) ÷ ${fmt(den)} = ${fmt(v)}%`,
      contributing,
    };
  });
}

// ---------------------------------------------------------------------------
// Target resolution: institution default → program → course → CO
// ---------------------------------------------------------------------------
export function resolveTarget(levels: { co?: number | null; course?: number | null; program?: number | null; institution: number }) {
  if (levels.co != null) return { target: levels.co, source: "CO" };
  if (levels.course != null) return { target: levels.course, source: "COURSE" };
  if (levels.program != null) return { target: levels.program, source: "PROGRAM" };
  return { target: levels.institution, source: "INSTITUTION" };
}
