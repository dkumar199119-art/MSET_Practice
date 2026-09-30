"use client";
import { useRef } from "react";
import { Trash2, Upload } from "lucide-react";
import { deleteEvidenceAction, uploadEvidenceAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ActionButton, ResultMessage, useServerAction } from "@/components/ui/action";
import { Field, Input, Select } from "@/components/ui/primitives";
import { human } from "@/lib/utils";

export function EvidenceUpload({ offeringId, types }: { offeringId: string; types: string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const { run, pending, result } = useServerAction(uploadEvidenceAction);
  return (
    <form ref={form} className="grid gap-3 rounded-xl border border-dashed border-lavender-300 bg-white/50 p-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run(new FormData(e.currentTarget)).then((r) => r.ok && form.current?.reset()); }}>
      <input type="hidden" name="offeringId" value={offeringId} />
      <Field label="Evidence type"><Select name="evidenceType">{types.map((t) => <option key={t} value={t}>{human(t)}</option>)}</Select></Field>
      <Field label="Title"><Input name="title" required minLength={3} placeholder="Mid-term question paper" /></Field>
      <Field label="File"><Input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.pptx" /></Field>
      <div className="flex items-end gap-3"><Button disabled={pending}><Upload /> Upload</Button></div>
      <ResultMessage result={result} className="md:col-span-4" />
    </form>
  );
}

export function DeleteEvidence({ offeringId, id }: { offeringId: string; id: string }) {
  return <ActionButton size="sm" variant="ghost" aria-label="Delete evidence" confirm="Delete this evidence file?" action={() => deleteEvidenceAction(offeringId, id)}><Trash2 /></ActionButton>;
}
