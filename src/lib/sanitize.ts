/**
 * Allow-list HTML sanitiser for rich-text fields (syllabus overview).
 * Keeps only simple formatting tags and strips every attribute, so no script,
 * event handler, style or URL can survive. Runs on the server before saving.
 */
const TAGS = "p|br|b|strong|i|em|ul|ol|li|h3|div|span";
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(new RegExp(`<(\\/?)(${TAGS})\\b[^>]*>`, "gi"), (_m, slash: string, tag: string) => `\u0000${slash}${tag.toLowerCase()}\u0001`)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
    .replace(/\u0000/g, "<")
    .replace(/\u0001/g, ">");
}
