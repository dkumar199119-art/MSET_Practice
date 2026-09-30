"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ base, steps }: { base: string; steps: { slug: string; label: string; done: boolean | null }[] }) {
  const path = usePathname();
  const current = path.split("/").pop();
  return (
    <ol className="space-y-0.5" aria-label="Course setup steps">
      <li>
        <Link href={base} className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm", path === base ? "bg-white text-violet-800 ring-1 ring-lavender-200" : "text-ink-2 hover:bg-white/60")}>
          <span className="grid size-5 place-items-center rounded-full bg-lavender-100 text-[10px] font-semibold text-violet-700">★</span> Overview
        </Link>
      </li>
      {steps.map((s, i) => {
        const active = current === s.slug;
        return (
          <li key={s.slug}>
            <Link href={`${base}/${s.slug}`} aria-current={active ? "step" : undefined}
              className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm transition-colors", active ? "bg-white text-violet-800 shadow-sm ring-1 ring-lavender-200" : "text-ink-2 hover:bg-white/60")}>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                s.done ? "bg-emerald-500 text-white" : active ? "bg-violet-600 text-white" : "bg-white text-muted ring-1 ring-lavender-200")}>
                {s.done ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="truncate">{s.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
