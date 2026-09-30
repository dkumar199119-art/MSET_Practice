/**
 * Runs the complete MVP lifecycle through the service layer on DATABASE_URL
 * (fresh seed required): HOD → PC → CC → Faculty A → students → reviews → LOCKED
 * → program attainment. Useful to populate dashboards for a demonstration.
 *   npm run db:reset && npm run demo
 */
import "dotenv/config";
import { actor, buildMarksRows, facultyCourseSetup, setupProgramAndAllocation, studentsSubmitFeedback } from "../tests/integration/scenario";
import * as marks from "../src/lib/services/marks";
import * as feedback from "../src/lib/services/feedback";
import * as attainment from "../src/lib/services/attainment";
import * as workflow from "../src/lib/services/workflow";
import * as ap from "../src/lib/services/action-plans";
import * as evidence from "../src/lib/services/evidence";
import { closePool } from "../src/lib/db";

async function main() {
  const ids = await setupProgramAndAllocation();
  console.log("Program BTECH-ME, course ME301 created and allocated to Faculty A");
  await facultyCourseSetup(ids.offeringId);
  const fa = await actor("faculty.a@obe.local");
  await marks.saveMarks(fa, { offeringId: ids.offeringId, fileName: "ME301_marks.xlsx", rows: await buildMarksRows(ids.offeringId) });
  await feedback.publishFeedback(fa, ids.offeringId);
  await studentsSubmitFeedback(ids.offeringId, 45);
  await attainment.calculateCourseAttainment(fa, ids.offeringId);
  const att = await attainment.getCourseAttainment(fa, ids.offeringId);
  for (const g of att.gaps.filter((x) => ["BELOW_TARGET", "CRITICAL"].includes(x.classification))) {
    await ap.createActionPlan(fa, { offeringId: ids.offeringId, gapId: g.id, level: g.level as "CO", entityCode: g.entity_code, rootCause: "Limited problem-solving practice for this outcome", correctiveAction: "Weekly tutorial sessions and a targeted assignment in the next offering" });
  }
  await evidence.uploadEvidence(fa, { offeringId: ids.offeringId, evidenceType: "QUESTION_PAPER", title: "Mid Term question paper (demo)" }, { name: "midterm.txt", type: "text/plain", data: Buffer.from("Demo question paper") });
  console.log("Faculty setup, marks, feedback, attainment, action plans and evidence complete");
  await workflow.submitForReview(fa, ids.offeringId);
  for (const r of ["cc.me@obe.local", "pc.me@obe.local", "hod.me@obe.local"]) await workflow.reviewOffering(await actor(r), { offeringId: ids.offeringId, decision: "APPROVE", comment: "Approved (demo)" });
  await attainment.calculateProgramAttainment(await actor("pc.me@obe.local"), ids.programId, ids.ay);
  console.log("ME301 approved & locked; program attainment calculated. Log in as iqac@obe.local to explore.");
}

main().then(closePool).catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
