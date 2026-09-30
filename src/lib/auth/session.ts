import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loadCurrentUser } from "./user";
import type { CurrentUser, Permission, Role } from "../rbac";
import { can, hasRole } from "../rbac";
import { AppError } from "../errors";

const COOKIE = "obe_session";
const TTL_SECONDS = 60 * 60 * 8;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new AppError("SESSION_SECRET must be set (min 32 chars)", "CONFIG");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const getSessionUserId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await getSessionUserId();
  if (!id) return null;
  return loadCurrentUser(id);
});

/** For pages: redirects to /login when not authenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActor(permission?: Permission, roles?: Role[]): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AppError("Your session has expired. Please sign in again.", "FORBIDDEN");
  if (permission && !can(u, permission)) throw new AppError("You do not have permission to perform this action.", "FORBIDDEN");
  if (roles && !hasRole(u, ...roles)) throw new AppError("You do not have permission to perform this action.", "FORBIDDEN");
  return u;
}
