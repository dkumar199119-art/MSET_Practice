/** Bloom's revised taxonomy & CO measurability checks (deterministic, no AI). */

export const BLOOM_LEVELS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export const BLOOM_LABELS: Record<BloomLevel, string> = {
  REMEMBER: "L1 Remember",
  UNDERSTAND: "L2 Understand",
  APPLY: "L3 Apply",
  ANALYZE: "L4 Analyze",
  EVALUATE: "L5 Evaluate",
  CREATE: "L6 Create",
};

export const BLOOM_VERBS: Record<BloomLevel, string[]> = {
  REMEMBER: ["define", "list", "recall", "state", "name", "identify", "label", "recognize", "reproduce", "memorize", "outline"],
  UNDERSTAND: ["explain", "describe", "summarize", "interpret", "classify", "discuss", "illustrate", "paraphrase", "compare", "infer", "distinguish", "represent"],
  APPLY: ["apply", "solve", "compute", "calculate", "use", "demonstrate", "implement", "determine", "execute", "estimate", "model", "operate", "perform", "sketch", "construct"],
  ANALYZE: ["analyze", "analyse", "differentiate", "examine", "investigate", "categorize", "deconstruct", "diagnose", "test", "correlate", "inspect"],
  EVALUATE: ["evaluate", "assess", "justify", "critique", "judge", "appraise", "validate", "recommend", "select", "prioritize", "verify", "optimize"],
  CREATE: ["design", "develop", "create", "formulate", "synthesize", "construct", "compose", "plan", "propose", "devise", "invent", "build", "generate"],
};

/** Verbs that describe internal states and cannot be measured directly. */
export const NON_MEASURABLE = ["understand", "know", "learn", "appreciate", "be aware", "become aware", "familiarize", "familiarise", "grasp", "realize", "believe", "be acquainted", "gain knowledge", "comprehend"];

export interface MeasurabilityResult {
  measurable: boolean;
  verb: string | null;
  detectedLevel: BloomLevel | null;
  issues: string[];
}

export function checkMeasurability(description: string, declared?: BloomLevel | null): MeasurabilityResult {
  const text = description.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  const issues: string[] = [];
  if (text.length < 15) issues.push("Outcome statement is too short to be specific.");
  const bad = NON_MEASURABLE.find((v) => new RegExp(`(^|\\s)${v}(\\s|$)`).test(text.split(" ").slice(0, 8).join(" ")));
  const words = text.split(" ");
  let verb: string | null = null;
  let level: BloomLevel | null = null;
  // the leading action verb (skip "students will be able to", "ability to")
  const lead = words.slice(0, 10);
  outer: for (const w of lead) {
    for (let i = BLOOM_LEVELS.length - 1; i >= 0; i--) {
      const lvl = BLOOM_LEVELS[i];
      if (BLOOM_VERBS[lvl].includes(w)) {
        verb = w;
        level = lvl;
        break outer;
      }
    }
  }
  if (bad) issues.push(`"${bad}" is not directly measurable — use an observable action verb (e.g. explain, apply, analyze).`);
  if (!verb) issues.push("No measurable Bloom's action verb found near the start of the statement.");
  if (declared && level && declared !== level) {
    issues.push(`Declared level ${BLOOM_LABELS[declared]} differs from the verb "${verb}" (${BLOOM_LABELS[level]}).`);
  }
  return { measurable: !bad && !!verb, verb, detectedLevel: level, issues };
}
