"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/misc";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { cn } from "@/lib/utils";

export function FeedbackForm({ offeringId, templateId, scaleMax, questions }: { offeringId: string; templateId: string; scaleMax: number; questions: { id: string; text: string }[] }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const { run, pending, result } = useServerAction(submitFeedbackAction);
  const complete = questions.every((q) => ratings[q.id]);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(offeringId, { templateId, ratings }); }}>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
          <legend className="sr-only">Question {i + 1}</legend>
          <p className="text-sm font-medium text-ink">{i + 1}. {q.text}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {Array.from({ length: scaleMax }, (_, k) => k + 1).map((v) => (
              <label key={v} className={cn("grid size-10 cursor-pointer place-items-center rounded-xl border text-sm font-semibold transition", ratings[q.id] === v ? "border-violet-600 bg-violet-600 text-white" : "border-lavender-200 bg-white hover:border-violet-300")}>
                <input type="radio" className="sr-only" name={q.id} value={v} checked={ratings[q.id] === v} onChange={() => setRatings({ ...ratings, [q.id]: v })} />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button disabled={!complete || pending || !!result?.ok}><Send /> Submit feedback</Button>
        {!complete && <span className="text-xs text-muted">Rate every outcome to submit.</span>}
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
