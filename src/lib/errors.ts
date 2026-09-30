export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "LOCKED" | "CONFLICT" | "CONFIG" | "WORKFLOW" | "INTERNAL";

export class AppError extends Error {
  constructor(message: string, public code: AppErrorCode = "INTERNAL", public details?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

interface PgError { code?: string; message?: string; hint?: string; detail?: string; constraint?: string }

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const pg = e as PgError;
  const msg = pg?.message ?? String(e);
  if (pg?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new AppError(
      /row-level security|permission denied/i.test(msg) ? "You do not have permission to perform this action." : msg,
      "FORBIDDEN",
    );
  }
  if (pg?.hint === "LOCKED") return new AppError(msg, "LOCKED");
  if (pg?.code === "P0001") return new AppError(msg, "WORKFLOW");
  if (pg?.code === "P0002") return new AppError(msg, "NOT_FOUND");
  if (pg?.code === "23505") return new AppError(uniqueMessage(pg), "CONFLICT");
  if (pg?.code === "23503") return new AppError("This record is referenced by other academic data and cannot be changed that way.", "CONFLICT");
  if (pg?.code === "23514" || pg?.code === "22P02" || pg?.code === "22003") return new AppError(`Invalid value: ${msg}`, "VALIDATION");
  return new AppError(msg, "INTERNAL");
}

function uniqueMessage(pg: PgError) {
  if (pg.message?.includes("Feedback already submitted")) return "Feedback already submitted";
  const c = pg.constraint ?? "";
  if (c.includes("email")) return "A user with this email already exists.";
  return `A record with the same identifying values already exists${c ? ` (${c})` : ""}.`;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; code?: AppErrorCode; details?: unknown };

export function fail(e: unknown): { ok: false; error: string; code?: AppErrorCode; details?: unknown } {
  const err = toAppError(e);
  if (err.code === "INTERNAL") console.error(e);
  return { ok: false, error: err.message, code: err.code, details: err.details };
}
