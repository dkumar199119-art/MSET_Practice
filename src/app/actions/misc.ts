"use server";
import { requireActor } from "@/lib/auth/session";
import * as ai from "@/lib/services/ai";
import * as fb from "@/lib/services/feedback";
import * as att from "@/lib/services/attainment";
import * as admin from "@/lib/services/admin";
import * as dash from "@/lib/services/dashboards";
import { act } from "./_act";

export async function runAiAction(offeringId: string, feature: ai.AiFeature, text?: string) {
  return act(async () => ai.runAiFeature(await requireActor("ai.use"), offeringId, feature, { text }));
}
export async function decideAiAction(input: Parameters<typeof ai.decideSuggestion>[1]) {
  return act(async () => ai.decideSuggestion(await requireActor("ai.use"), input));
}
export async function submitFeedbackAction(offeringId: string, input: Parameters<typeof fb.submitFeedback>[1]) {
  return act(async () => fb.submitFeedback(await requireActor("feedback.submit"), input), { revalidate: ["/student", `/student/feedback/${offeringId}`], message: "Thank you — your feedback was submitted" });
}
export async function calculateProgramAttainmentAction(programId: string, academicYearId: string) {
  return act(async () => {
    const r = await att.calculateProgramAttainment(await requireActor("attainment.program"), programId, academicYearId);
    return { courses: r.coursesIncluded, provisional: r.provisional };
  }, { revalidate: [`/programs/${programId}`], message: "Program attainment calculated" });
}
export async function createSchoolAction(input: Parameters<typeof admin.createSchool>[1]) {
  return act(async () => admin.createSchool(await requireActor("institution.manage"), input), { revalidate: ["/admin/structure"], message: "School created" });
}
export async function createDepartmentAction(input: Parameters<typeof admin.createDepartment>[1]) {
  return act(async () => admin.createDepartment(await requireActor("institution.manage"), input), { revalidate: ["/admin/structure"], message: "Department created" });
}
export async function createYearAction(input: Parameters<typeof admin.createAcademicYear>[1]) {
  return act(async () => admin.createAcademicYear(await requireActor("institution.manage"), input), { revalidate: ["/admin/structure"], message: "Academic year created with Odd/Even semesters" });
}
export async function createBatchAction(input: Parameters<typeof admin.createBatch>[1]) {
  return act(async () => admin.createBatch(await requireActor("institution.manage"), input), { revalidate: ["/admin/structure"], message: "Batch created" });
}
export async function createUserAction(input: Parameters<typeof admin.createUser>[1]) {
  return act(async () => admin.createUser(await requireActor("users.manage"), input), { revalidate: ["/admin/users"], message: "User created" });
}
export async function setUserActiveAction(userId: string, active: boolean) {
  return act(async () => admin.setUserActive(await requireActor("users.manage"), userId, active), { revalidate: ["/admin/users"] });
}
export async function updateSettingsAction(input: Parameters<typeof admin.updateSettings>[1]) {
  return act(async () => admin.updateSettings(await requireActor("methodology.manage"), input), { revalidate: ["/admin/settings"], message: "Settings saved" });
}
export async function publishMethodologyAction(input: Parameters<typeof admin.publishMethodology>[1]) {
  return act(async () => admin.publishMethodology(await requireActor("methodology.manage"), input), { revalidate: ["/admin/settings"], message: "New methodology version published" });
}
export async function markNotificationsReadAction() {
  return act(async () => dash.markNotificationsRead(await requireActor()), { revalidate: ["/notifications"] });
}
