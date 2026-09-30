import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const demo = process.env.NODE_ENV !== "production";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-8 md:grid-cols-2 md:items-center">
        <div className="hidden md:block">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-lavender-200">
            <GraduationCap className="size-4" /> Outcome-Based Education · IQAC
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-ink">OBE IQAC Command Center</h1>
          <p className="mt-3 max-w-md text-muted">
            Program and course ownership, CO–PO articulation, direct &amp; indirect attainment, gap analysis and accreditation-ready
            reporting — with a complete audit trail.
          </p>
        </div>
        <div className="glass-strong rounded-3xl p-8">
          <h2 className="text-xl font-semibold text-ink">Sign in</h2>
          <p className="mb-6 text-sm text-muted">Use your institutional account.</p>
          <LoginForm />
          {demo && (
            <div className="mt-6 rounded-xl border border-lavender-200 bg-lavender-50/70 p-3 text-xs text-ink-2">
              <div className="mb-1 font-medium">Demo accounts (password <code>Password@123</code>)</div>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {["hod.me", "pc.me", "cc.me", "faculty.a", "iqac", "superadmin", "reviewer", "dean.engg"].map((u) => (
                  <code key={u}>{u}@obe.local</code>
                ))}
                <code>me23001@students.obe.local</code>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
