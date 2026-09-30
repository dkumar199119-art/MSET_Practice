import Link from "next/link";
import { Bell, GraduationCap, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/services/dashboards";
import { NAV } from "@/components/layout/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { logoutAction } from "@/app/actions/auth";
import { ROLE_LABELS } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadCount(user);
  const groups = NAV.map((g) => ({ label: g.label, items: g.items.filter((i) => i.show(user)).map(({ href, label, icon }) => ({ href, label, icon })) })).filter((g) => g.items.length);
  return (
    <div className="min-h-screen">
      <header className="sticky top-3 z-30 mx-3 mt-3 md:mx-4">
        <div className="glass-strong flex h-14 items-center justify-between rounded-2xl px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-md">
              <GraduationCap className="size-4" />
            </span>
            <span className="text-sm font-semibold text-ink">OBE IQAC Command Center</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/notifications" className="relative rounded-xl p-2 text-ink-2 hover:bg-lavender-100" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="size-4" />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">{unread}</span>}
            </Link>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-ink">{user.fullName}</div>
              <div className="text-[11px] text-muted">{user.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded-xl p-2 text-ink-2 hover:bg-lavender-100" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex gap-4 px-3 pt-4 pb-10 md:px-4">
        <aside className="glass sticky top-20 hidden h-[calc(100vh-6rem)] w-60 shrink-0 overflow-y-auto rounded-2xl p-3 lg:block">
          <Sidebar groups={groups} />
        </aside>
        <main className="min-w-0 flex-1">
          <details className="glass mb-4 rounded-2xl p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">Menu</summary>
            <div className="mt-3"><Sidebar groups={groups} /></div>
          </details>
          {children}
        </main>
      </div>
    </div>
  );
}
