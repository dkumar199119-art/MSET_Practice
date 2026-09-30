/**
 * Deterministic pattern detection over aggregated attainment data. Always
 * available (no AI) and also forms the aggregated context sent to Gemini.
 */

export interface InsightInput {
  final: { co_code: string; final_pct: number | null; target_pct: number; gap: number | null; status: string; direct_pct: number | null; indirect_pct: number | null }[];
  questions: { assessment: string; label: string; max_marks: number; avg: number | null; co_codes: string[] }[];
  po: { code: string; value_pct: number | null; target?: number | null; gap?: number | null; status?: string }[];
  mappings: { co_code: string; outcome_code: string; value: number }[];
}

export interface Insight { kind: "WEAK_CO" | "DISCREPANCY" | "LOW_QUESTION" | "OUTCOME_GAP" | "UNASSESSED"; severity: "info" | "warning" | "critical"; message: string }

export function detectPatterns(input: InsightInput, discrepancyThreshold = 20): Insight[] {
  const out: Insight[] = [];
  for (const f of input.final) {
    if (f.status === "CRITICAL" || f.status === "BELOW_TARGET") {
      out.push({ kind: "WEAK_CO", severity: f.status === "CRITICAL" ? "critical" : "warning", message: `${f.co_code} is ${f.status.replace("_", " ").toLowerCase()}: final ${f.final_pct}% vs target ${f.target_pct}% (gap ${f.gap}).` });
    }
    if (f.direct_pct !== null && f.indirect_pct !== null && Math.abs(f.direct_pct - f.indirect_pct) >= discrepancyThreshold) {
      const higher = f.indirect_pct > f.direct_pct ? "students' self-assessment is higher than measured performance" : "measured performance exceeds students' perception";
      out.push({ kind: "DISCREPANCY", severity: "warning", message: `${f.co_code}: direct ${f.direct_pct}% vs indirect ${f.indirect_pct}% — ${higher}.` });
    }
  }
  for (const q of input.questions) {
    if (q.avg === null) continue;
    const pct = (q.avg / q.max_marks) * 100;
    if (pct < 40) out.push({ kind: "LOW_QUESTION", severity: "warning", message: `${q.assessment} ${q.label} (${q.co_codes.join(", ") || "unmapped"}) averaged ${pct.toFixed(1)}% of maximum marks.` });
  }
  for (const p of input.po) {
    if (p.status === "CRITICAL" || p.status === "BELOW_TARGET") {
      const contributors = input.mappings.filter((m) => m.outcome_code === p.code && m.value > 0).map((m) => `${m.co_code}(${m.value})`);
      out.push({ kind: "OUTCOME_GAP", severity: p.status === "CRITICAL" ? "critical" : "warning", message: `${p.code} at ${p.value_pct}% is below target (gap ${p.gap}); contributing COs: ${contributors.join(", ") || "none"}.` });
    }
  }
  return out;
}
