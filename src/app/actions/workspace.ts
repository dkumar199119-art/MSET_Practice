"use server";
import { requireActor } from "@/lib/auth/session";
import * as ws from "@/lib/services/workspace";
import * as marks from "@/lib/services/marks";
import * as fb from "@/lib/services/feedback";
import * as att from "@/lib/services/attainment";
import * as wf from "@/lib/services/workflow";
import * as ap from "@/lib/services/action-plans";
import * as ev from "@/lib/services/evidence";
import { AppError } from "@/lib/errors";
import { act } from "./_act";

const path = (id: string) => `/workspace/${id}`;
const actor = () => requireActor();

export async function confirmProfileAction(offeringId: string) {
  return act(async () => ws.confirmProfile(await actor(), offeringId), { revalidate: [path(offeringId)], message: "Course profile confirmed" });
}
export async function requestCorrectionAction(input: Parameters<typeof ws.requestCorrection>[1]) {
  return act(async () => ws.requestCorrection(await actor(), input), { revalidate: [path(input.offeringId)], message: "Correction request sent to the Program Coordinator" });
}
export async function saveSyllabusAction(input: Parameters<typeof ws.saveSyllabus>[1]) {
  return act(async () => ws.saveSyllabus(await actor(), input), { revalidate: [path(input.offeringId)], message: "Syllabus saved" });
}
export async function extractSyllabusTextAction(form: FormData) {
  return act(async () => {
    await actor();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a PDF or DOCX file", "VALIDATION");
    if (file.size > 10 * 1024 * 1024) throw new AppError("Files must be 10 MB or smaller", "VALIDATION");
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ buffer: buf })).value;
    }
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
    if (file.name.toLowerCase().endsWith(".txt")) return buf.toString("utf8");
    throw new AppError("Supported formats: PDF, DOCX, TXT", "VALIDATION");
  });
}
export async function saveObjectivesAction(input: Parameters<typeof ws.saveObjectives>[1]) {
  return act(async () => ws.saveObjectives(await actor(), input), { revalidate: [path(input.offeringId)], message: "Course objectives saved" });
}
export async function saveOutcomesAction(input: Parameters<typeof ws.saveOutcomes>[1]) {
  return act(async () => ws.saveOutcomes(await actor(), input), { revalidate: [path(input.offeringId)], message: "Course outcomes saved" });
}
export async function saveBloomAction(input: Parameters<typeof ws.saveBloomLevels>[1]) {
  return act(async () => ws.saveBloomLevels(await actor(), input), { revalidate: [path(input.offeringId)], message: "Bloom levels saved" });
}
export async function saveTargetsAction(input: Parameters<typeof ws.saveTargets>[1]) {
  return act(async () => ws.saveTargets(await actor(), input), { revalidate: [path(input.offeringId)], message: "CO targets saved" });
}
export async function saveMatrixAction(input: Parameters<typeof ws.saveMatrix>[1]) {
  return act(async () => ws.saveMatrix(await actor(), input), { revalidate: [path(input.offeringId)], message: `CO-${input.kind} matrix saved` });
}
export async function saveAssessmentsAction(input: Parameters<typeof ws.saveAssessments>[1]) {
  return act(async () => ws.saveAssessments(await actor(), input), { revalidate: [path(input.offeringId)], message: "Assessment structure saved" });
}
export async function saveQuestionMappingAction(input: Parameters<typeof ws.saveQuestionMapping>[1]) {
  return act(async () => ws.saveQuestionMapping(await actor(), input), { revalidate: [path(input.offeringId)], message: "Question mapping saved" });
}
export async function enrollBatchAction(offeringId: string) {
  return act(async () => ws.enrollBatch(await actor(), offeringId), { revalidate: [path(offeringId)] });
}
export async function enrollRollsAction(offeringId: string, rolls: string[]) {
  return act(async () => ws.enrollByRollNumbers(await actor(), offeringId, rolls), { revalidate: [path(offeringId)] });
}
export async function withdrawStudentAction(offeringId: string, studentId: string) {
  return act(async () => ws.withdrawStudent(await actor(), offeringId, studentId), { revalidate: [path(offeringId)] });
}
export async function validateMarksAction(input: Parameters<typeof marks.validateMarks>[1]) {
  return act(async () => marks.validateMarks(await actor(), input));
}
export async function saveMarksAction(input: Parameters<typeof marks.saveMarks>[1]) {
  return act(async () => marks.saveMarks(await actor(), input), { revalidate: [path(input.offeringId)] });
}
export async function publishFeedbackAction(offeringId: string) {
  return act(async () => fb.publishFeedback(await actor(), offeringId), { revalidate: [path(offeringId)], message: "Feedback form published to enrolled students" });
}
export async function closeFeedbackAction(offeringId: string) {
  return act(async () => fb.closeFeedback(await actor(), offeringId), { revalidate: [path(offeringId)], message: "Feedback closed" });
}
export async function calculateAttainmentAction(offeringId: string) {
  return act(async () => {
    const r = await att.calculateCourseAttainment(await actor(), offeringId);
    return { cos: r.final.length, complete: r.final.filter((f) => f.finalPct !== null).length };
  }, { revalidate: [path(offeringId)], message: "Attainment calculated" });
}
export async function submitCourseAction(offeringId: string, comment?: string) {
  return act(async () => wf.submitForReview(await actor(), offeringId, comment), { revalidate: [path(offeringId), "/reviews"], message: "Course submitted for review" });
}
export async function reviewCourseAction(input: Parameters<typeof wf.reviewOffering>[1]) {
  return act(async () => wf.reviewOffering(await requireActor("course.review"), input), { revalidate: [path(input.offeringId), "/reviews"], message: input.decision === "APPROVE" ? "Approved" : "Returned to faculty" });
}
export async function requestRevisionAction(offeringId: string, reason: string) {
  return act(async () => wf.requestRevision(await actor(), offeringId, reason), { revalidate: [path(offeringId)], message: "Revision request sent" });
}
export async function decideRevisionAction(offeringId: string, requestId: string, approve: boolean, comment?: string) {
  return act(async () => wf.decideRevision(await requireActor("course.review"), requestId, approve, comment), { revalidate: [path(offeringId), "/reviews"], message: approve ? "Revision approved — new version opened" : "Revision rejected" });
}
export async function createActionPlanAction(input: Parameters<typeof ap.createActionPlan>[1]) {
  return act(async () => ap.createActionPlan(await actor(), input), { revalidate: [path(input.offeringId)], message: "Action plan recorded" });
}
export async function updateActionPlanStatusAction(offeringId: string, id: string, status: Parameters<typeof ap.updateActionPlanStatus>[2]) {
  return act(async () => ap.updateActionPlanStatus(await actor(), id, status), { revalidate: [path(offeringId)] });
}
export async function uploadEvidenceAction(form: FormData) {
  const offeringId = String(form.get("offeringId") ?? "");
  return act(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose a file to upload", "VALIDATION");
    return ev.uploadEvidence(await actor(), { offeringId, evidenceType: String(form.get("evidenceType")) as never, title: String(form.get("title") ?? "") },
      { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) });
  }, { revalidate: [path(offeringId)], message: "Evidence uploaded" });
}
export async function deleteEvidenceAction(offeringId: string, id: string) {
  return act(async () => ev.deleteEvidence(await actor(), id), { revalidate: [path(offeringId)] });
}
