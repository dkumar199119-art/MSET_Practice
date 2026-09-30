"use server";
import { requireActor } from "@/lib/auth/session";
import * as svc from "@/lib/services/academic";
import { act } from "./_act";

export async function createProgramAction(input: Parameters<typeof svc.createProgram>[1]) {
  return act(async () => svc.createProgram(await requireActor("program.create"), input), { revalidate: ["/programs"], message: "Program created" });
}
export async function assignProgramCoordinatorAction(programId: string, userId: string) {
  return act(async () => svc.assignProgramCoordinator(await requireActor("program.assign_coordinator"), programId, userId), { revalidate: [`/programs/${programId}`], message: "Program Coordinator assigned" });
}
export async function removeProgramCoordinatorAction(programId: string, userId: string) {
  return act(async () => svc.removeProgramCoordinator(await requireActor("program.assign_coordinator"), programId, userId), { revalidate: [`/programs/${programId}`] });
}
export async function upsertOutcomeAction(input: Parameters<typeof svc.upsertOutcome>[1]) {
  return act(async () => svc.upsertOutcome(await requireActor("program.manage"), input), { revalidate: [`/programs/${input.programId}`], message: "Saved" });
}
export async function deleteOutcomeAction(programId: string, kind: "PO" | "PSO", id: string) {
  return act(async () => svc.deleteOutcome(await requireActor("program.manage"), kind, id), { revalidate: [`/programs/${programId}`] });
}
export async function updateProgramTargetsAction(input: Parameters<typeof svc.updateProgramTargets>[1]) {
  return act(async () => svc.updateProgramTargets(await requireActor("program.manage"), input), { revalidate: [`/programs/${input.programId}`], message: "Program targets saved" });
}
export async function createCourseAction(input: Parameters<typeof svc.createCourse>[1]) {
  return act(async () => svc.createCourse(await requireActor("course.create"), input), { revalidate: [`/programs/${input.programId}`, "/courses"], message: "Course created" });
}
export async function assignCourseCoordinatorAction(courseId: string, userId: string) {
  return act(async () => svc.assignCourseCoordinator(await requireActor("course.assign_coordinator"), courseId, userId), { revalidate: [`/courses/${courseId}`], message: "Course Coordinator assigned" });
}
export async function removeCourseCoordinatorAction(courseId: string, userId: string) {
  return act(async () => svc.removeCourseCoordinator(await requireActor("course.assign_coordinator"), courseId, userId), { revalidate: [`/courses/${courseId}`] });
}
export async function allocateFacultyAction(input: Parameters<typeof svc.allocateFaculty>[1]) {
  return act(async () => svc.allocateFaculty(await requireActor("course.allocate"), input), { revalidate: [`/courses/${input.courseId}`], message: "Faculty allocated — the course now appears in their dashboard" });
}
export async function deactivateAssignmentAction(courseId: string, assignmentId: string) {
  return act(async () => svc.deactivateAssignment(await requireActor("course.allocate"), assignmentId), { revalidate: [`/courses/${courseId}`] });
}
