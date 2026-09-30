import { z } from "zod";

/**
 * Attainment methodology. Nothing in the calculation engine is hard-coded:
 * every weight, threshold and band comes from a versioned methodology record
 * (institution default, optionally overridden per program).
 */
export const methodologySchema = z
  .object({
    direct_weight: z.number().min(0).max(100),
    indirect_weight: z.number().min(0).max(100),
    /** A student "meets" a CO when their CO score (% of mapped marks) is >= this. */
    student_threshold_pct: z.number().min(0).max(100),
    /** MARKS: pool all mapped question marks. ASSESSMENT_WEIGHTAGE: average per-assessment % using assessment weightage. */
    assessment_weighting: z.enum(["MARKS", "ASSESSMENT_WEIGHTAGE"]),
    /** MEAN_SCALED: mean rating / scale max × 100. PERCENT_AGREE: % of ratings >= indirect_agree_min. */
    indirect_method: z.enum(["MEAN_SCALED", "PERCENT_AGREE"]),
    indirect_agree_min: z.number().int().min(1).max(10),
    /** Attainment level bands on a percentage, evaluated from highest min. */
    level_bands: z.array(z.object({ min: z.number().min(0).max(100), level: z.number().int().min(0).max(5) })).min(1),
    /** gap >= 0 achieved; >= -near near target; >= -critical below target; else critical */
    near_target_margin: z.number().min(0).max(100),
    critical_margin: z.number().min(0).max(100),
    program_aggregation: z.enum(["COURSE_WEIGHTED", "CREDIT_WEIGHTED", "MAPPING_WEIGHTED"]),
    program_scope: z.enum(["ALL_CALCULATED", "LOCKED_ONLY"]),
  })
  .refine((m) => Math.abs(m.direct_weight + m.indirect_weight - 100) < 1e-9, {
    message: "Direct and indirect weights must add up to 100",
    path: ["indirect_weight"],
  })
  .refine((m) => m.critical_margin >= m.near_target_margin, {
    message: "Critical margin must be greater than or equal to the near-target margin",
    path: ["critical_margin"],
  });

export type Methodology = z.infer<typeof methodologySchema>;

export const DEFAULT_METHODOLOGY: Methodology = {
  direct_weight: 80,
  indirect_weight: 20,
  student_threshold_pct: 60,
  assessment_weighting: "MARKS",
  indirect_method: "MEAN_SCALED",
  indirect_agree_min: 4,
  level_bands: [
    { min: 70, level: 3 },
    { min: 60, level: 2 },
    { min: 50, level: 1 },
  ],
  near_target_margin: 5,
  critical_margin: 15,
  program_aggregation: "MAPPING_WEIGHTED",
  program_scope: "ALL_CALCULATED",
};

export const AGGREGATION_LABELS: Record<Methodology["program_aggregation"], string> = {
  COURSE_WEIGHTED: "Course-weighted (simple average of contributing courses)",
  CREDIT_WEIGHTED: "Credit-weighted average",
  MAPPING_WEIGHTED: "Mapping-strength weighted average (Σ CO-PO correlation)",
};
