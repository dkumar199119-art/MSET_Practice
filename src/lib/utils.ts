import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtPct = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}%`);
export const fmtGap = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}`);
const ACRONYMS = new Set(["Hod", "Co", "Po", "Pso", "Iqac", "Pdf", "Csv"]);
export const human = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase()).split(" ").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
