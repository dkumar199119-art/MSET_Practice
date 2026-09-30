import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { buildCourseReport, buildProgramReport, recordReport, REPORT_TYPES, type ReportType } from "@/lib/reports/datasets";
import { render } from "@/lib/reports/render";
import { toAppError } from "@/lib/errors";

const q = z.object({
  type: z.enum(Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]]),
  format: z.enum(["PDF", "XLSX", "CSV"]),
  offeringId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "reports.generate")) return new Response("Forbidden", { status: 403 });
  const parsed = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return new Response("Invalid report request", { status: 400 });
  const p = parsed.data;
  try {
    const dataset = p.type.startsWith("COURSE")
      ? await buildCourseReport(user, p.offeringId ?? "", p.type as "COURSE_ATTAINMENT", user.fullName)
      : await buildProgramReport(user, p.programId ?? "", p.academicYearId ?? "", p.type as "PROGRAM_ATTAINMENT", user.fullName);
    const out = render(dataset, p.format);
    const base = `${dataset.subtitle ?? dataset.title}`.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80);
    const fileName = `${p.type}_${base}.${out.ext}`;
    await recordReport(user, p.type, p.format, { offeringId: p.offeringId ?? "", programId: p.programId ?? "", academicYearId: p.academicYearId ?? "" }, fileName);
    return new Response(new Uint8Array(out.data), { headers: { "Content-Type": out.contentType, "Content-Disposition": `attachment; filename="${fileName}"` } });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.message, { status: err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 400 });
  }
}
