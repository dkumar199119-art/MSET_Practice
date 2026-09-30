"use client";
import { useState } from "react";
import { Check, Plus, Save } from "lucide-react";
import { saveObjectivesAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Textarea, Badge } from "@/components/ui/primitives";
import { AiBox, AiButton, useAi } from "../ai-panel";
import { move, RowControls } from "../list-editor";

type Item = { id?: string; description: string; source: "MANUAL" | "AI_ACCEPTED" | "AI_MODIFIED"; aiSuggestionId?: string | null; aiText?: string };

export function ObjectivesEditor({ offeringId, readOnly, initial }: { offeringId: string; readOnly: boolean; initial: { id: string; code: string; description: string; source: string }[] }) {
  const [items, setItems] = useState<Item[]>(initial.map((o) => ({ id: o.id, description: o.description, source: o.source as Item["source"] })));
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const save = useServerAction(saveObjectivesAction);
  const ai = useAi(offeringId, "SUGGEST_OBJECTIVES");
  const toSave = () => items.filter((i) => i.description.trim()).map((i) => ({
    id: i.id, description: i.description,
    source: i.aiText === undefined ? i.source : i.aiText === i.description ? "AI_ACCEPTED" as const : "AI_MODIFIED" as const,
    aiSuggestionId: i.aiSuggestionId ?? null,
  }));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="3 · Course Objectives" description="What the course intends to impart (COBJ1, COBJ2, …). Codes follow the order." action={!readOnly && <AiButton pending={ai.pending} onClick={() => ai.request()}>Suggest Course Objectives</AiButton>} />
        <CardBody className="space-y-3">
          {(ai.data || ai.error) && (
            <AiBox title="Suggested objectives" model={ai.data?.model} error={ai.error} onDismiss={() => void ai.decide("REJECTED")}>
              <ul className="space-y-2">
                {ai.data?.output.objectives.map((o, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-white/80 p-2 text-sm">
                    <div><div>{o.description}</div>{o.rationale && <div className="text-xs text-muted">{o.rationale}</div>}</div>
                    <Button size="sm" variant="secondary" disabled={accepted.has(i)} onClick={() => {
                      setItems([...items, { description: o.description, source: "AI_ACCEPTED", aiSuggestionId: ai.data!.suggestionId, aiText: o.description }]);
                      const next = new Set(accepted).add(i);
                      setAccepted(next);
                      void ai.decide(next.size === ai.data!.output.objectives.length ? "ACCEPTED" : "PARTIALLY_ACCEPTED", [...next].map((k) => ai.data!.output.objectives[k].description));
                    }}>
                      <Check /> {accepted.has(i) ? "Added" : "Accept"}
                    </Button>
                  </li>
                ))}
              </ul>
            </AiBox>
          )}
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-white/70 p-3 ring-1 ring-line">
              <div className="w-16 shrink-0 pt-2 text-sm font-semibold text-violet-800">COBJ{i + 1}</div>
              <div className="flex-1 space-y-1">
                <Textarea rows={2} aria-label={`Objective ${i + 1}`} readOnly={readOnly} value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                {it.source !== "MANUAL" && <Badge tone="violet">AI {it.aiText !== undefined && it.aiText !== it.description ? "modified" : "accepted"}</Badge>}
              </div>
              <RowControls i={i} n={items.length} readOnly={readOnly} onMove={(d) => setItems(move(items, i, d))} onDelete={() => setItems(items.filter((_, j) => j !== i))} />
            </div>
          ))}
          {!readOnly && <Button variant="secondary" onClick={() => setItems([...items, { description: "", source: "MANUAL" }])}><Plus /> Add objective</Button>}
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending} onClick={() => void save.run({ offeringId, items: toSave() })}><Save /> Save objectives</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}
