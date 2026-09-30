"use client";
import { useState, useTransition, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { runAiAction, decideAiAction } from "@/app/actions/misc";
import type { AiFeature, AiOutput } from "@/lib/services/ai";
import { Button } from "@/components/ui/button";

export const AI_REVIEW_LABEL = "AI-generated suggestion — requires academic review. Nothing is applied until you accept it.";

/** Requests a Gemini suggestion; the caller decides what to do with the output. */
export function useAi<F extends AiFeature>(offeringId: string, feature: F) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ suggestionId: string; output: AiOutput<F>; model: string } | null>(null);
  const request = (text?: string) =>
    start(async () => {
      setError(null);
      const r = await runAiAction(offeringId, feature, text);
      if (r.ok && r.data) setData({ suggestionId: r.data.suggestionId, output: r.data.output as AiOutput<F>, model: r.data.model });
      else if (!r.ok) setError(r.error);
    });
  const decide = async (status: "ACCEPTED" | "PARTIALLY_ACCEPTED" | "MODIFIED" | "REJECTED", finalValue?: unknown) => {
    if (!data) return;
    await decideAiAction({ suggestionId: data.suggestionId, status, finalValue });
    if (status === "REJECTED") setData(null);
  };
  return { request, pending, error, data, setData, decide };
}

export function AiButton({ onClick, pending, children, disabled }: { onClick: () => void; pending: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending || disabled}>
      <Sparkles /> {pending ? "Asking Gemini…" : children}
    </Button>
  );
}

export function AiBox({ title, model, children, onDismiss, error }: { title: string; model?: string; children?: ReactNode; onDismiss?: () => void; error?: string | null }) {
  if (error) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">{error}</div>;
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-lavender-50 to-sky-soft/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-violet-900"><Sparkles className="size-4" /> {title}</div>
        {onDismiss && <Button size="sm" variant="ghost" onClick={onDismiss}>Reject all</Button>}
      </div>
      <p className="mb-2 text-[11px] font-medium text-violet-700">{AI_REVIEW_LABEL}{model ? ` · ${model}` : ""}</p>
      {children}
    </div>
  );
}
