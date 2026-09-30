import type { ComponentType } from "react";
import type { StepProps } from "./types";
import { ProfileStep } from "./profile";
import { SyllabusStep } from "./syllabus";
import { ObjectivesStep } from "./objectives";
import { BloomStep, OutcomesStep, TargetsStep } from "./outcomes";
import { matrixStep } from "./matrix";
import { AssessmentsStep, QuestionMappingStep, StudentsStep } from "./assessments";
import { MarksStep } from "./marks";
import { ContributionStep, CourseAttainmentStep, DirectStep, FeedbackStep, IndirectStep } from "./attainment";
import { GapsStep } from "./gaps";
import { EvidenceStep } from "./evidence";
import { ReportStep } from "./report";
import { SubmissionStep } from "./submission";

export const STEP_COMPONENTS: Record<string, ComponentType<StepProps>> = {
  profile: ProfileStep,
  syllabus: SyllabusStep,
  objectives: ObjectivesStep,
  outcomes: OutcomesStep,
  bloom: BloomStep,
  targets: TargetsStep,
  "co-po": matrixStep("PO"),
  "co-pso": matrixStep("PSO"),
  assessments: AssessmentsStep,
  "question-mapping": QuestionMappingStep,
  students: StudentsStep,
  marks: MarksStep,
  direct: DirectStep,
  feedback: FeedbackStep,
  indirect: IndirectStep,
  attainment: CourseAttainmentStep,
  contribution: ContributionStep,
  gaps: GapsStep,
  evidence: EvidenceStep,
  report: ReportStep,
  submission: SubmissionStep,
};
