import { z } from "zod";
import { ensure, parse, tx, type Actor } from "./base";

export const actionPlanSchema = z.object({
  offeringId: z.string().uuid(),
  gapId: z.string().uuid().optional().nullable(),
  level: z.enum(["CO", "COURSE", "PO", "PSO"]),
  entityCode: z.string().trim().min(1).max(30),
  rootCause: z.string().trim().min(10, "Describe the root cause (min 10 characters)").max(4000),
  correctiveAction: z.string().trim().min(10, "Describe the corrective action (min 10 characters)").max(4000),
  responsibleUserId: z.string().uuid().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  source: z.enum(["MANUAL", "AI_ACCEPTED", "AI_MODIFIED"]).default("MANUAL"),
});

export async function createActionPlan(actor: Actor, input: z.input<typeof actionPlanSchema>) {
  const d = parse(actionPlanSchema, input);
  return tx(actor, async (db) => {
    const prog = await db.one<{ program_id: string }>("select c.program_id from course_offerings o join courses c on c.id = o.course_id where o.id = $1", [d.offeringId]);
    const r = await db.one<{ id: string }>(
      `insert into action_plans (gap_id, offering_id, program_id, level, entity_code, root_cause, corrective_action, responsible_user_id, target_date, source, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [d.gapId ?? null, d.offeringId, prog.program_id, d.level, d.entityCode, d.rootCause, d.correctiveAction, d.responsibleUserId ?? actor.id, d.targetDate || null, d.source, actor.id]);
    return r.id;
  }, "FACULTY");
}

export async function updateActionPlanStatus(actor: Actor, id: string, status: "PLANNED" | "IN_PROGRESS" | "IMPLEMENTED" | "REVIEWED" | "CLOSED") {
  return tx(actor, async (db) => {
    const r = await db.query("update action_plans set status = $2 where id = $1 returning id", [id, status]);
    ensure(r.length === 1, "Action plan not found or not permitted", "FORBIDDEN");
  });
}

export function listActionPlans(actor: Actor, offeringId: string) {
  return tx(actor, (db) => db.query<{ id: string; level: string; entity_code: string; root_cause: string; corrective_action: string; responsible_name: string | null; target_date: string | null; status: string; source: string; created_at: string }>(`
    select a.id, a.level, a.entity_code, a.root_cause, a.corrective_action, u.full_name responsible_name, a.target_date::text, a.status, a.source, a.created_at::text
    from action_plans a left join users u on u.id = a.responsible_user_id where a.offering_id = $1 order by a.created_at desc`, [offeringId]));
}
