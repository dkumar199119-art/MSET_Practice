/** AI governance: server-side only, logged, validated, never overwrites faculty data. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDb, sql } from "./helpers";
import { actor, facultyCourseSetup, setupProgramAndAllocation } from "./scenario";
import { closePool } from "../../src/lib/db";
import { setGeminiTransport, parseModelJson } from "../../src/lib/ai/gemini";
import * as ai from "../../src/lib/services/ai";

let offeringId: string;

beforeAll(async () => {
  await resetTestDb(5);
  const ids = await setupProgramAndAllocation();
  offeringId = ids.offeringId;
  await facultyCourseSetup(offeringId);
});
afterAll(async () => {
  setGeminiTransport(null);
  await closePool();
});

describe("AI assistant", () => {
  it("reports and logs NOT_CONFIGURED when no Gemini key is set", async () => {
    delete process.env.GEMINI_API_KEY;
    const f = await actor("faculty.a@obe.local");
    await expect(ai.runAiFeature(f, offeringId, "SUGGEST_COS")).rejects.toThrow(/Gemini is not configured/);
    const rows = await sql<{ status: string }>("select status from ai_interactions where feature = 'SUGGEST_COS'");
    expect(rows.map((r) => r.status)).toEqual(["NOT_CONFIGURED"]);
  });

  it("stores a CO-PO suggestion as PENDING and does not modify the matrix", async () => {
    const before = await sql("select co_id, po_id, value from co_po_mappings order by co_id, po_id");
    let prompt = "";
    setGeminiTransport(async (req) => {
      prompt = req.prompt;
      return { model: "mock", latencyMs: 1, text: "```json\n" + JSON.stringify({ mappings: [{ co_code: "CO1", outcome_code: "PO1", value: 3, rationale: "core" }] }) + "\n```" };
    });
    const f = await actor("faculty.a@obe.local");
    const r = await ai.runAiFeature(f, offeringId, "SUGGEST_CO_PO");
    expect(r.output.mappings[0]).toMatchObject({ co_code: "CO1", outcome_code: "PO1", value: 3 });
    expect(prompt).toContain("PO1 Engineering knowledge");
    const after = await sql("select co_id, po_id, value from co_po_mappings order by co_id, po_id");
    expect(after).toEqual(before);
    const s = await sql<{ status: string }>("select status from ai_suggestions where id = $1", [r.suggestionId]);
    expect(s[0].status).toBe("PENDING");
    await ai.decideSuggestion(f, { suggestionId: r.suggestionId, status: "REJECTED" });
    const d = await sql<{ status: string; decided_by: string }>("select status, decided_by from ai_suggestions where id = $1", [r.suggestionId]);
    expect(d[0]).toEqual({ status: "REJECTED", decided_by: f.id });
  });

  it("rejects malformed model output and logs the error", async () => {
    setGeminiTransport(async () => ({ model: "mock", latencyMs: 1, text: JSON.stringify({ cos: [{ description: "short" }] }) }));
    const f = await actor("faculty.a@obe.local");
    await expect(ai.runAiFeature(f, offeringId, "SUGGEST_COS")).rejects.toThrow(/did not match/);
    const rows = await sql<{ status: string }>("select status from ai_interactions where feature = 'SUGGEST_COS' order by created_at");
    expect(rows.map((r) => r.status)).toEqual(["NOT_CONFIGURED", "ERROR"]);
  });

  it("denies course-design suggestions to non-assigned faculty and respects the institution AI switch", async () => {
    setGeminiTransport(async () => ({ model: "mock", latencyMs: 1, text: "{}" }));
    const fb = await actor("faculty.b@obe.local");
    await expect(ai.runAiFeature(fb, offeringId, "SUGGEST_COS")).rejects.toThrow(/cannot access/);
    await sql("update institution_settings set ai_enabled = false");
    const f = await actor("faculty.a@obe.local");
    await expect(ai.runAiFeature(f, offeringId, "SUGGEST_COS")).rejects.toThrow(/disabled/);
    await sql("update institution_settings set ai_enabled = true");
  });

  it("parses fenced JSON", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
