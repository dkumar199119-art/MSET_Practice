"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/auth/user";

export async function loginAction(_: unknown, form: FormData): Promise<{ error?: string }> {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const id = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!id) return { error: "Invalid email or password." };
  await createSession(id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
