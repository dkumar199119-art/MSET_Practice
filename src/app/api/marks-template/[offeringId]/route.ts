import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth/session";
import { getMarksTemplate } from "@/lib/services/marks";
import { toAppError } from "@/lib/errors";

export async function GET(_: Request, { params }: { params: Promise<{ offeringId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { offeringId } = await params;
  try {
    const t = await getMarksTemplate(user, offeringId);
    const rows: (string | number)[][] = [["Student ID", "Student Name", "Assessment", "Question", "Marks", "Max Marks (info)"]];
    for (const s of t.students) for (const q of t.questions) rows.push([s.roll_no, s.full_name, q.assessment, q.label, "", q.max_marks]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Marks");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${t.course.code}_${t.course.section}_marks_template.xlsx"`,
      },
    });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.message, { status: err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 400 });
  }
}
