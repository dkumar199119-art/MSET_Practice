import { getCurrentUser } from "@/lib/auth/session";
import { downloadEvidence } from "@/lib/services/evidence";
import { toAppError } from "@/lib/errors";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const f = await downloadEvidence(user, id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mime_type,
        "Content-Disposition": `attachment; filename="${f.file_name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.message, { status: err.code === "NOT_FOUND" ? 404 : 403 });
  }
}
