/** Course setup steps, completion scoring and the submission checklist. */

export type ProgressKey =
  | "profile" | "syllabus" | "objectives" | "cos" | "bloom" | "targets" | "co_po" | "co_pso" | "assessments"
  | "question_mapping" | "students" | "marks" | "direct" | "feedback" | "indirect" | "final" | "po_pso" | "gaps"
  | "action_plans" | "evidence";

export type Progress = Record<ProgressKey, boolean> & { stale?: boolean };

export interface WizardStep {
  slug: string;
  label: string;
  progressKey?: ProgressKey;
}

/** Guided course setup wizard (order matters). */
export const WIZARD_STEPS: WizardStep[] = [
  { slug: "profile", label: "Course Profile", progressKey: "profile" },
  { slug: "syllabus", label: "Syllabus", progressKey: "syllabus" },
  { slug: "objectives", label: "Course Objectives", progressKey: "objectives" },
  { slug: "outcomes", label: "Course Outcomes", progressKey: "cos" },
  { slug: "bloom", label: "Bloom's Taxonomy", progressKey: "bloom" },
  { slug: "targets", label: "CO Targets", progressKey: "targets" },
  { slug: "co-po", label: "CO-PO Matrix", progressKey: "co_po" },
  { slug: "co-pso", label: "CO-PSO Matrix", progressKey: "co_pso" },
  { slug: "assessments", label: "Assessment Structure", progressKey: "assessments" },
  { slug: "question-mapping", label: "Question Mapping", progressKey: "question_mapping" },
  { slug: "students", label: "Students / Section", progressKey: "students" },
  { slug: "marks", label: "Marks Upload", progressKey: "marks" },
  { slug: "direct", label: "Direct Attainment", progressKey: "direct" },
  { slug: "feedback", label: "Course Feedback", progressKey: "feedback" },
  { slug: "indirect", label: "Indirect Attainment", progressKey: "indirect" },
  { slug: "attainment", label: "Course Attainment", progressKey: "final" },
  { slug: "contribution", label: "PO/PSO Contribution", progressKey: "po_pso" },
  { slug: "gaps", label: "Gap Analysis & Actions", progressKey: "gaps" },
  { slug: "evidence", label: "Evidence", progressKey: "evidence" },
  { slug: "report", label: "Course Report" },
  { slug: "submission", label: "Submission" },
];

export const WEIGHT_LABELS: Record<string, string> = {
  profile: "Course Profile", syllabus: "Syllabus", objectives: "Objectives", cos: "Course Outcomes", bloom: "Bloom Levels",
  targets: "CO Targets", co_po: "CO-PO Matrix", co_pso: "CO-PSO Matrix", assessments: "Assessment Plan",
  question_mapping: "Question Mapping", marks: "Marks", direct: "Direct Attainment", feedback: "Feedback",
  indirect: "Indirect Attainment", final: "Final Attainment",
};

export const DEFAULT_COMPLETION_WEIGHTS: Record<string, number> = {
  profile: 5, syllabus: 10, objectives: 5, cos: 10, bloom: 5, targets: 5, co_po: 10, co_pso: 5, assessments: 10,
  question_mapping: 5, marks: 10, direct: 5, feedback: 5, indirect: 5, final: 5,
};

export function stepSlugFor(key: ProgressKey): string {
  if (key === "action_plans") return "gaps";
  return WIZARD_STEPS.find((s) => s.progressKey === key)?.slug ?? "profile";
}

export function computeCompletion(progress: Partial<Progress>, weights: Record<string, number>) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const done = entries.filter(([k]) => progress[k as ProgressKey]).reduce((a, [, w]) => a + w, 0);
  const missing = entries.filter(([k]) => !progress[k as ProgressKey]).map(([k]) => ({ key: k as ProgressKey, label: WEIGHT_LABELS[k] ?? k, slug: stepSlugFor(k as ProgressKey) }));
  return { percent: total > 0 ? Math.round((done / total) * 100) : 0, missing };
}

export interface ChecklistItem { key: ProgressKey; label: string; done: boolean; slug: string }

/** Everything that must be true before "Submit Course for Review" is allowed. */
export function submissionChecklist(p: Partial<Progress>): ChecklistItem[] {
  const items: [ProgressKey, string][] = [
    ["profile", "Course Profile"], ["syllabus", "Syllabus"], ["objectives", "Course Objectives"], ["cos", "Course Outcomes"],
    ["bloom", "Bloom Levels"], ["targets", "CO Targets"], ["co_po", "CO-PO Matrix"], ["co_pso", "CO-PSO Matrix"],
    ["assessments", "Assessment Plan"], ["question_mapping", "Question Mapping"], ["students", "Students enrolled"],
    ["marks", "Marks"], ["direct", "Direct Attainment"], ["feedback", "Student Feedback"], ["indirect", "Indirect Attainment"],
    ["final", "Final Attainment"], ["po_pso", "PO/PSO Contribution"], ["gaps", "Gap Analysis"],
    ["action_plans", "Action Plan for gaps (if required)"], ["evidence", "Evidence"],
  ];
  return items.map(([key, label]) => ({ key, label, done: !!p[key], slug: stepSlugFor(key) }));
}
