"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/errors";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

/** Runs a server action, shows its outcome, refreshes server data on success. */
export function useServerAction<A extends unknown[], T>(fn: (...args: A) => Promise<ActionResult<T>>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<T> | null>(null);
  const run = (...args: A) =>
    new Promise<ActionResult<T>>((resolve) => {
      start(async () => {
        const r = await fn(...args);
        setResult(r);
        if (r.ok) router.refresh();
        resolve(r);
      });
    });
  return { run, pending, result, setResult };
}

export function ResultMessage({ result, className }: { result: ActionResult<unknown> | null; className?: string }) {
  if (!result) return null;
  if (result.ok) return result.message ? <p role="status" className={cn("text-sm text-emerald-700", className)}>{result.message}</p> : null;
  return <p role="alert" className={cn("text-sm text-rose-700", className)}>{result.error}</p>;
}

export function ActionButton<T>({ action, children, confirm, successMessage, ...props }: Omit<ButtonProps, "onClick" | "action"> & { action: () => Promise<ActionResult<T>>; children: ReactNode; confirm?: string; successMessage?: string }) {
  const { run, pending, result } = useServerAction(action);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...props}
        disabled={pending || props.disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          void run();
        }}
      >
        {pending ? "Working…" : children}
      </Button>
      <ResultMessage result={result && result.ok && successMessage ? { ...result, message: successMessage } : result} />
    </span>
  );
}
