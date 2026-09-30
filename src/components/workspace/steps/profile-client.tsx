"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmProfileAction, requestCorrectionAction } from "@/app/actions/workspace";
import { ActionButton, ResultMessage, useServerAction } from "@/components/ui/action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/primitives";

export function ConfirmProfile({ offeringId }: { offeringId: string }) {
  return <ActionButton action={() => confirmProfileAction(offeringId)}><CheckCircle2 /> Confirm course profile</ActionButton>;
}

export function CorrectionForm({ offeringId }: { offeringId: string }) {
  const [f, setF] = useState({ field: "Credits", requestedValue: "", reason: "" });
  const { run, pending, result } = useServerAction(requestCorrectionAction);
  return (
    <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run({ offeringId, ...f }).then((r) => r.ok && setF({ ...f, requestedValue: "", reason: "" })); }}>
      <Field label="Field"><Select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}>{["Course Name", "Credits", "L / T / P", "Course Type", "Course Category", "Semester", "Section", "Other"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
      <Field label="Correct value"><Input required value={f.requestedValue} onChange={(e) => setF({ ...f, requestedValue: e.target.value })} /></Field>
      <Field label="Reason" className="md:col-span-2"><Input required minLength={5} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <div className="flex items-center gap-3 md:col-span-4"><Button variant="secondary" disabled={pending}>Request correction</Button><ResultMessage result={result} /></div>
    </form>
  );
}
