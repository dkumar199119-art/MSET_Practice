/**
 * Server-side Gemini client. The API key is read from process.env only on the
 * server and is never sent to the browser or included in logs.
 */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("Gemini is not configured. Set GEMINI_API_KEY on the server to enable AI assistance.");
    this.name = "AiNotConfiguredError";
  }
}

export interface GeminiRequest {
  system: string;
  prompt: string;
  /** optional inline document, e.g. an uploaded syllabus PDF */
  inlineData?: { mimeType: string; base64: string };
  temperature?: number;
}

export interface GeminiResponse { text: string; model: string; latencyMs: number }

export type GeminiTransport = (req: GeminiRequest) => Promise<GeminiResponse>;

let transportOverride: GeminiTransport | null = null;
/** Test hook: replace the network transport. */
export function setGeminiTransport(t: GeminiTransport | null) {
  transportOverride = t;
}

export function geminiConfigured() {
  return !!transportOverride || !!process.env.GEMINI_API_KEY;
}

export function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export async function callGemini(req: GeminiRequest): Promise<GeminiResponse> {
  if (transportOverride) return transportOverride(req);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiNotConfiguredError();
  const model = geminiModel();
  const started = Date.now();
  const parts: unknown[] = [{ text: req.prompt }];
  if (req.inlineData) parts.push({ inline_data: { mime_type: req.inlineData.mimeType, data: req.inlineData.base64 } });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: req.temperature ?? 0.3, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty response");
  return { text, model, latencyMs: Date.now() - started };
}

/** Parses JSON returned by the model, tolerating ```json fences. */
export function parseModelJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(t);
}
