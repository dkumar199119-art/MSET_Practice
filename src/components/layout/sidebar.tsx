"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Building2, Circle, ClipboardCheck, FileText, FolderOpen, Gauge, LayoutDashboard, Layers, MessageSquare, ScrollText, Settings, Target, UserCog, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { BookOpen, Building2, ClipboardCheck, FileText, FolderOpen, Gauge, LayoutDashboard, Layers, MessageSquare, ScrollText, Settings, Target, UserCog };
import { cn } from "@/lib/utils";

export interface SidebarGroup { label: string; items: { href: string; label: string; icon: string }[] }

export function Sidebar({ groups }: { groups: SidebarGroup[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-5" aria-label="Main">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">{g.label}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon] ?? Circle;
              const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href + "/")) || path === it.href;
              return (
                <li key={it.href + it.label}>
                  <Link
                    href={it.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                      active ? "bg-white text-violet-800 shadow-sm ring-1 ring-lavender-200" : "text-ink-2 hover:bg-white/60",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-violet-600" : "text-muted")} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
