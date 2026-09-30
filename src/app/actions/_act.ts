import "server-only";
import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/errors";

export async function act<T>(fn: () => Promise<T>, opts: { revalidate?: string[]; message?: string } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
    return { ok: true, data, message: opts.message };
  } catch (e) {
    return fail(e);
  }
}
