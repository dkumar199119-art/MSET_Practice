import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...p} />;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...p} />;
}

export const inputCls = "h-9 w-full rounded-xl border border-lavender-200 bg-white/85 px-3 text-sm text-ink placeholder:text-muted/70 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-lavender-50 disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputCls, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(inputCls, "h-auto min-h-20 py-2 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(inputCls, "pr-8", className)} {...p} />
));
Select.displayName = "Select";

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-ink-2", className)} {...p} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  violet: "bg-lavender-100 text-violet-800 border-lavender-200",
  blue: "bg-sky-soft text-blue-800 border-blue-100",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  orange: "bg-orange-50 text-orange-800 border-orange-200",
  red: "bg-rose-50 text-rose-800 border-rose-200",
} as const;
export type BadgeTone = keyof typeof badgeTones;
export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", badgeTones[tone], className)} {...p} />;
}

export function PageHeader({ title, description, eyebrow, actions }: { title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-medium tracking-wide text-violet-700 uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...p} />
    </div>
  );
}
export const Th = ({ className, ...p }: HTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("border-b border-line px-3 py-2 text-left text-xs font-medium tracking-wide text-muted uppercase", className)} {...p} />
);
export const Td = ({ className, ...p }: HTMLAttributes<HTMLTableCellElement> & { colSpan?: number }) => (
  <td className={cn("border-b border-line/70 px-3 py-2.5 align-top text-ink", className)} {...p} />
);

export function Progress({ value, className, tone = "violet" }: { value: number; className?: string; tone?: "violet" | "green" | "amber" | "red" }) {
  const v = Math.max(0, Math.min(100, value));
  const fill = { violet: "bg-violet-500", green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-rose-500" }[tone];
  const track = { violet: "bg-lavender-100", green: "bg-emerald-100", amber: "bg-amber-100", red: "bg-rose-100" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full", track, className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-lavender-300 bg-white/50 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-violet-500">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-muted">{label}</div>
        {icon && <div className="rounded-lg bg-lavender-100 p-1.5 text-violet-700 [&_svg]:size-4">{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Alert({ tone = "violet", title, children, className }: { tone?: "violet" | "amber" | "red" | "green" | "blue"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const cls = {
    violet: "border-lavender-200 bg-lavender-50/80 text-violet-900",
    amber: "border-amber-200 bg-amber-50/80 text-amber-900",
    red: "border-rose-200 bg-rose-50/80 text-rose-900",
    green: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
    blue: "border-blue-100 bg-sky-soft/80 text-blue-900",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", cls, className)}>
      {title && <div className="font-medium">{title}</div>}
      {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}
