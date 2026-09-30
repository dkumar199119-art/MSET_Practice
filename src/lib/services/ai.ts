/**
 * AI Course Assistant (Gemini). Principles:
 *  - server-side only; API key never leaves the server
 *  - data minimisation: only course design text and *aggregated* results are
 *    sent — never student names, roll numbers or individual marks
 *  - suggestions are stored as PENDING and never overwrite faculty data;
 *    faculty accept / modify / reject explicitly
 *  - every interaction is logged (user, feature, input metadata, response, status)
 */
import { z } from "zod";
import { AppError } from "../errors";
import { BLOOM_LEVELS } from "../domain/bloom";
import { detectPatterns, type Insight } from "../domain/insights";
import { AiNotConfiguredError, callGemini, geminiConfigured, geminiModel, parseModelJson } from "../ai/gemini";
import type { Db } from "../db";
import { ensure, tx, type Actor } from "./base";
import { loadSettings } from "./workspace";

export const AI_FEATURES = ["SYLLABUS_ANALYSIS", "SUGGEST_OBJECTIVES", "SUGGEST_COS", "CO_REVIEW", "SUGGEST_CO_PO", "SUGGEST_CO_PSO", "GAP_ANALYSIS"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_LABEL = "AI-generated analysis — requires academic review.";

const SYSTEM = `You are an Outcome-Based Education (OBE) and accreditation (NBA/ABET/NAAC) expert assisting university faculty.
You write precise, measurable academic statements using Bloom's revised taxonomy action verbs.
You only use the information provided. You never invent student data. Respond ONLY with valid JSON matching the requested shape.`;

const bloom = z.preprocess((v) => String(v ?? "").toUpperCase().replace("ANALYSE", "ANALYZE"), z.enum(BLOOM_LEVELS));

const OUTPUT_SCHEMAS = {
  SYLLABUS_ANALYSIS: z.object({
    summary: z.string(),
    units: z.array(z.object({ unit_no: z.coerce.number().int(), title: z.string(), topics: z.string(), hours: z.coerce.number().min(0) })).default([]),
    key_topics: z.array(z.string()).default([]),
    observations: z.array(z.string()).default([]),
  }),
  SUGGEST_OBJECTIVES: z.object({ objectives: z.array(z.object({ description: z.string().min(10), rationale: z.string().default("") })).min(1) }),
  SUGGEST_COS: z.object({ cos: z.array(z.object({ description: z.string().min(15), bloom_level: bloom, rationale: z.string().default("") })).min(1) }),
  CO_REVIEW: z.object({
    reviews: z.array(z.object({ co_code: z.string(), measurable: z.boolean(), suggested_bloom: bloom, improved_statement: z.string(), rationale: z.string().default("") })),
  }),
  SUGGEST_CO_PO: z.object({ mappings: z.array(z.object({ co_code: z.string(), outcome_code: z.string(), value: z.coerce.number().int().min(0).max(5), rationale: z.string().default("") })) }),
  SUGGEST_CO_PSO: z.object({ mappings: z.array(z.object({ co_code: z.string(), outcome_code: z.string(), value: z.coerce.number().int().min(0).max(5), rationale: z.string().default("") })) }),
  GAP_ANALYSIS: z.object({
    patterns: z.array(z.string()).default([]),
    possible_reasons: z.array(z.string()).default([]),
    teaching_interventions: z.array(z.string()).default([]),
    assessment_improvements: z.array(z.string()).default([]),
    remedial_activities: z.array(z.string()).default([]),
    monitoring_plan: z.array(z.string()).default([]),
    corrective_actions: z.array(z.object({ level: z.enum(["CO", "COURSE", "PO", "PSO"]), entity_code: z.string(), root_cause: z.string(), corrective_action: z.string() })).default([]),
  }),
} satisfies Record<AiFeature, z.ZodType>;

export type AiOutput<F extends AiFeature> = z.infer<(typeof OUTPUT_SCHEMAS)[F]>;

interface BuiltPrompt { prompt: string; metadata: Record<string, unknown>; inlineData?: { mimeType: string; base64: string } }

async function courseBasics(db: Db, offeringId: string) {
  return db.one<{ code: string; name: string; course_type: string; credits: number; program_name: string; program_id: string }>(
    `select c.code, c.name, c.course_type, c.credits, p.name program_name, p.id program_id
     from course_offerings o join courses c on c.id = o.course_id join programs p on p.id = c.program_id where o.id = $1`, [offeringId]);
}

async function syllabusText(db: Db, offeringId: string) {
  const s = await db.maybe<{ overview: string; raw_text: string | null }>("select overview, raw_text from syllabus where offering_id = $1", [offeringId]);
  const units = await db.query<{ unit_no: number; title: string; topics: string; hours: number }>("select unit_no, title, topics, hours from syllabus_units where offering_id = $1 order by unit_no", [offeringId]);
  const unitsText = units.map((u) => `Unit ${u.unit_no}: ${u.title} (${u.hours} h)\n${u.topics}`).join("\n\n");
  return { overview: s?.overview ?? "", raw: s?.raw_text ?? "", unitsText, unitCount: units.length };
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function buildPrompt(db: Db, offeringId: string, feature: AiFeature, extra: { text?: string } = {}): Promise<BuiltPrompt> {
  const c = await courseBasics(db, offeringId);
  const header = `Course: ${c.code} ${c.name} (${c.course_type}, ${c.credits} credits) — Program: ${c.program_name}`;
  const syl = await syllabusText(db, offeringId);
  const cos = await db.query<{ code: string; description: string; bloom_level: string | null }>("select code, description, bloom_level from course_outcomes where offering_id = $1 order by sort_order", [offeringId]);
  const coText = cos.map((x) => `${x.code}: ${x.description}${x.bloom_level ? ` [${x.bloom_level}]` : ""}`).join("\n");

  switch (feature) {
    case "SYLLABUS_ANALYSIS": {
      const text = (extra.text ?? "").trim() || syl.raw || `${stripHtml(syl.overview)}\n${syl.unitsText}`;
      ensure(text.length >= 50, "Provide the syllabus text (paste or upload) before analysis");
      return {
        prompt: `${header}\n\nSyllabus text:\n"""${text.slice(0, 60000)}"""\n\nStructure this syllabus into units/modules and analyse it.\nReturn JSON: {"summary": string, "units": [{"unit_no": number, "title": string, "topics": string, "hours": number}], "key_topics": string[], "observations": string[]}`,
        metadata: { chars: text.length },
      };
    }
    case "SUGGEST_OBJECTIVES":
      ensure(syl.unitCount > 0 || syl.raw, "Enter the syllabus before requesting objectives");
      return {
        prompt: `${header}\n\nSyllabus:\n${syl.unitsText || syl.raw.slice(0, 30000)}\n\nSuggest 4-6 course objectives (what the course intends to impart; instructor perspective).\nReturn JSON: {"objectives": [{"description": string, "rationale": string}]}`,
        metadata: { units: syl.unitCount },
      };
    case "SUGGEST_COS": {
      ensure(syl.unitCount > 0 || syl.raw, "Enter the syllabus before requesting course outcomes");
      const objs = await db.query<{ code: string; description: string }>("select code, description from course_objectives where offering_id = $1 order by sort_order", [offeringId]);
      return {
        prompt: `${header}\n\nSyllabus:\n${syl.unitsText || syl.raw.slice(0, 30000)}\n\nCourse objectives:\n${objs.map((o) => `${o.code}: ${o.description}`).join("\n") || "(none)"}\n\nSuggest 5 measurable course outcomes (student perspective, start with a Bloom action verb, avoid "understand/know"), covering all units, with progressive Bloom levels.\nReturn JSON: {"cos": [{"description": string, "bloom_level": "REMEMBER|UNDERSTAND|APPLY|ANALYZE|EVALUATE|CREATE", "rationale": string}]}`,
        metadata: { units: syl.unitCount, objectives: objs.length },
      };
    }
    case "CO_REVIEW":
      ensure(cos.length > 0, "Enter course outcomes first");
      return {
        prompt: `${header}\n\nCourse outcomes:\n${coText}\n\nFor each CO: check measurability, identify the Bloom level of its action verb, and propose an improved statement (keep the original intent).\nReturn JSON: {"reviews": [{"co_code": string, "measurable": boolean, "suggested_bloom": "REMEMBER|UNDERSTAND|APPLY|ANALYZE|EVALUATE|CREATE", "improved_statement": string, "rationale": string}]}`,
        metadata: { cos: cos.length },
      };
    case "SUGGEST_CO_PO":
    case "SUGGEST_CO_PSO": {
      ensure(cos.length > 0, "Enter course outcomes first");
      const table = feature === "SUGGEST_CO_PO" ? "program_outcomes" : "program_specific_outcomes";
      const outs = await db.query<{ code: string; title: string; description: string }>(`select code, title, description from ${table} where program_id = $1 order by sort_order, code`, [c.program_id]);
      ensure(outs.length > 0, `The program has no ${feature === "SUGGEST_CO_PO" ? "POs" : "PSOs"} defined`);
      const settings = await loadSettings(db);
      return {
        prompt: `${header}\n\nSyllabus summary:\n${(syl.unitsText || syl.raw).slice(0, 12000)}\n\nCourse outcomes:\n${coText}\n\n${feature === "SUGGEST_CO_PO" ? "Program outcomes" : "Program specific outcomes"}:\n${outs.map((o) => `${o.code} ${o.title}: ${o.description}`).join("\n")}\n\nSuggest the CO-${feature === "SUGGEST_CO_PO" ? "PO" : "PSO"} articulation matrix on a 0-${settings.cam_scale_max} scale (0 none, 1 low, 2 moderate, 3 high). Be conservative: map only genuine correlations, justify each non-zero cell.\nReturn JSON: {"mappings": [{"co_code": string, "outcome_code": string, "value": number, "rationale": string}]}`,
        metadata: { cos: cos.length, outcomes: outs.length, scale: settings.cam_scale_max },
      };
    }
    case "GAP_ANALYSIS": {
      const ctx = await gapContext(db, offeringId);
      ensure(ctx.final.length > 0, "Calculate course attainment before gap analysis");
      return {
        prompt: `${header}\n\nAggregated attainment (no individual student data):\n${JSON.stringify({ course_outcomes: ctx.final, assessment_items: ctx.questions, program_outcomes: ctx.po, detected_patterns: ctx.patterns.map((p) => p.message) }, null, 1)}\n\nIdentify patterns (weak COs, low assessment items, direct vs indirect discrepancy, COs driving PO gaps). Provide possible reasons and concrete, feasible interventions for the next offering.\nReturn JSON: {"patterns": string[], "possible_reasons": string[], "teaching_interventions": string[], "assessment_improvements": string[], "remedial_activities": string[], "monitoring_plan": string[], "corrective_actions": [{"level": "CO|COURSE|PO|PSO", "entity_code": string, "root_cause": string, "corrective_action": string}]}`,
        metadata: { cos: ctx.final.length, questions: ctx.questions.length, patterns: ctx.patterns.length, aggregated_only: true },
      };
    }
  }
}

export async function gapContext(db: Db, offeringId: string) {
  const final = await db.query<{ co_code: string; final_pct: number | null; target_pct: number; gap: number | null; status: string; direct_pct: number | null; indirect_pct: number | null }>(`
    select co.code co_code, ca.final_pct, ca.target_pct, ca.gap, ca.status, ca.direct_pct, ca.indirect_pct
    from course_attainment ca join course_outcomes co on co.id = ca.co_id where ca.offering_id = $1 and ca.is_current order by co.sort_order`, [offeringId]);
  const questions = await db.query<{ assessment: string; label: string; max_marks: number; avg: number | null; co_codes: string[] }>(`
    select a.name assessment, q.label, q.max_marks, round(avg(sm.marks), 2) avg,
      coalesce((select array_agg(co.code order by co.sort_order) from question_co_mappings m join course_outcomes co on co.id = m.co_id where m.question_id = q.id), '{}') co_codes
    from assessments a join assessment_questions q on q.assessment_id = a.id left join student_marks sm on sm.question_id = q.id
    where a.offering_id = $1 group by a.name, a.sort_order, q.id, q.label, q.max_marks, q.sort_order order by a.sort_order, q.sort_order`, [offeringId]);
  const po = await db.query<{ code: string; value_pct: number | null; target: number | null; gap: number | null; status: string }>(`
    select g.entity_code code, g.actual value_pct, g.target, g.gap, g.classification status from gap_analysis g
    where g.offering_id = $1 and g.is_current and g.level in ('PO','PSO') order by g.level, g.entity_code`, [offeringId]);
  const mappings = await db.query<{ co_code: string; outcome_code: string; value: number }>(`
    select co.code co_code, po.code outcome_code, m.value from co_po_mappings m join course_outcomes co on co.id = m.co_id join program_outcomes po on po.id = m.po_id where m.offering_id = $1
    union all
    select co.code, p.code, m.value from co_pso_mappings m join course_outcomes co on co.id = m.co_id join program_specific_outcomes p on p.id = m.pso_id where m.offering_id = $1`, [offeringId]);
  const patterns: Insight[] = detectPatterns({ final, questions, po, mappings });
  return { final, questions, po, mappings, patterns };
}

export function getGapInsights(actor: Actor, offeringId: string) {
  return tx(actor, (db) => gapContext(db, offeringId));
}

export interface AiRunResult<F extends AiFeature> { suggestionId: string; interactionId: string; output: AiOutput<F>; model: string; label: string }

export async function runAiFeature<F extends AiFeature>(actor: Actor, offeringId: string, feature: F, extra: { text?: string } = {}): Promise<AiRunResult<F>> {
  const built = await tx(actor, async (db) => {
    const settings = await loadSettings(db);
    ensure(settings.ai_enabled, "AI assistance is disabled by the institution", "CONFIG");
    const access = await db.maybe<{ read: boolean; edit: boolean }>("select app.can_read_offering($1) read, app.can_edit_offering($1) edit", [offeringId]);
    ensure(access?.read, "You cannot access this course", "FORBIDDEN");
    ensure(feature === "GAP_ANALYSIS" || access.edit, "Only assigned faculty can request course design suggestions", "FORBIDDEN");
    return buildPrompt(db, offeringId, feature, extra);
  });

  const log = (status: "SUCCESS" | "ERROR" | "NOT_CONFIGURED", response: unknown, error: string | null, latency: number | null) =>
    tx(actor, (db) => db.one<{ id: string }>(
      `insert into ai_interactions (user_id, feature, offering_id, provider, model, input_metadata, response, status, error, latency_ms)
       values ($1,$2,$3,'gemini',$4,$5,$6,$7,$8,$9) returning id`,
      [actor.id, feature, offeringId, geminiModel(), JSON.stringify({ ...built.metadata, prompt_chars: built.prompt.length }), response === null ? null : JSON.stringify(response), status, error, latency]));

  if (!geminiConfigured()) {
    await log("NOT_CONFIGURED", null, "GEMINI_API_KEY not set", null);
    throw new AppError(new AiNotConfiguredError().message, "CONFIG");
  }
  let output: AiOutput<F>;
  let model = geminiModel();
  let latency = 0;
  try {
    const res = await callGemini({ system: SYSTEM, prompt: built.prompt, inlineData: built.inlineData });
    model = res.model;
    latency = res.latencyMs;
    const parsed = OUTPUT_SCHEMAS[feature].safeParse(parseModelJson(res.text));
    if (!parsed.success) throw new Error(`AI response did not match the expected structure: ${parsed.error.issues[0]?.message}`);
    output = parsed.data as AiOutput<F>;
  } catch (e) {
    const msg = (e as Error).message;
    await log("ERROR", null, msg.slice(0, 1000), latency || null);
    throw new AppError(`AI assistance failed: ${msg}`, "INTERNAL");
  }
  const interaction = await log("SUCCESS", output, null, latency);
  const suggestion = await tx(actor, async (db) => {
    const r = await db.one<{ id: string }>(
      "insert into ai_suggestions (interaction_id, offering_id, feature, payload, created_by) values ($1,$2,$3,$4,$5) returning id",
      [interaction.id, offeringId, feature, JSON.stringify(output), actor.id]);
    await db.query("select app.log_event('AI_SUGGESTION_GENERATED', 'ai_suggestions', $1, $2, null, $3)", [r.id, offeringId, JSON.stringify({ feature, model })]);
    return r;
  });
  return { suggestionId: suggestion.id, interactionId: interaction.id, output, model, label: AI_LABEL };
}

export const decisionSchema = z.object({
  suggestionId: z.string().uuid(),
  status: z.enum(["ACCEPTED", "PARTIALLY_ACCEPTED", "MODIFIED", "REJECTED"]),
  finalValue: z.unknown().optional(),
});

export async function decideSuggestion(actor: Actor, input: z.input<typeof decisionSchema>) {
  const d = decisionSchema.parse(input);
  return tx(actor, async (db) => {
    const r = await db.query(
      "update ai_suggestions set status = $2, final_value = $3, decided_by = $4, decided_at = now() where id = $1 returning offering_id",
      [d.suggestionId, d.status, d.finalValue === undefined ? null : JSON.stringify(d.finalValue), actor.id]);
    ensure(r.length === 1, "Suggestion not found or not permitted", "FORBIDDEN");
  });
}

export function latestSuggestion(actor: Actor, offeringId: string, feature: AiFeature) {
  return tx(actor, (db) => db.maybe<{ id: string; payload: unknown; status: string; created_at: string }>(
    "select id, payload, status, created_at::text from ai_suggestions where offering_id = $1 and feature = $2 order by created_at desc limit 1", [offeringId, feature]));
}

export function aiStatus() {
  return { configured: geminiConfigured(), model: geminiModel() };
}
