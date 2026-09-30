"use client";
import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { saveMarksAction, validateMarksAction } from "@/app/actions/workspace";
import { detectColumns, MARKS_FIELD_LABELS, MARKS_FIELDS, REQUIRED_MARKS_FIELDS, type MarksField, type MarksRowRaw, type MarksValidationResult } from "@/lib/domain/marks";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Table, Td, Th, Badge } from "@/components/ui/primitives";
import { ResultMessage, useServerAction } from "@/components/ui/action";

type Stage = "upload" | "map" | "validated" | "saved";

export function MarksUploader({ offeringId, courseCode }: { offeringId: string; courseCode: string }) {
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<MarksField, string>>>({});
  const [report, setReport] = useState<MarksValidationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const validate = useServerAction(validateMarksAction);
  const save = useServerAction(saveMarksAction);

  const onFile = async (f: File) => {
    setParseError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
      if (aoa.length < 2) throw new Error("The sheet has no data rows");
      const hdr = (aoa[0] as unknown[]).map((h) => String(h).trim());
      setHeaders(hdr);
      setData(aoa.slice(1));
      setMapping(detectColumns(hdr));
      setFileName(f.name);
      setReport(null);
      setStage("map");
    } catch (e) {
      setParseError(`Could not read the file: ${(e as Error).message}`);
    }
  };

  const rows = (): MarksRowRaw[] =>
    data.map((r, i) => ({
      rowNumber: i + 2,
      values: Object.fromEntries(MARKS_FIELDS.filter((f) => mapping[f]).map((f) => {
        const v = r[headers.indexOf(mapping[f]!)];
        return [f, typeof v === "number" ? v : v === undefined || v === null ? null : String(v)];
      })),
    }));
  const missingRequired = REQUIRED_MARKS_FIELDS.filter((f) => !mapping[f]);
  const payload = () => ({ offeringId, fileName, columnMapping: mapping as Record<string, string>, rows: rows() });

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs">
        {["Upload", "Detect & map columns", "Preview", "Validate", "Confirm & save"].map((s, i) => {
          const idx = { upload: 0, map: 2, validated: 3, saved: 5 }[stage];
          return <li key={s}><Badge tone={i < idx ? "green" : i === idx ? "violet" : "neutral"}>{i + 1}. {s}</Badge></li>;
        })}
      </ol>

      <Field label={`Marks file for ${courseCode} (.xlsx, .xls, .csv) — columns: Student ID, Student Name, Assessment, Question, Marks`}>
        <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      </Field>
      {parseError && <Alert tone="red">{parseError}</Alert>}

      {stage !== "upload" && (
        <>
          <div className="rounded-xl bg-white/70 p-3 ring-1 ring-line">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><FileSpreadsheet className="size-4 text-violet-600" /> {fileName} · {data.length} rows · detected columns</div>
            <div className="grid gap-2 md:grid-cols-6">
              {MARKS_FIELDS.map((f) => (
                <Field key={f} label={MARKS_FIELD_LABELS[f] + (REQUIRED_MARKS_FIELDS.includes(f) ? " *" : "")}>
                  <Select value={mapping[f] ?? ""} onChange={(e) => { setMapping({ ...mapping, [f]: e.target.value || undefined }); setReport(null); setStage("map"); }}>
                    <option value="">— not mapped —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Preview (first 8 rows, mapped)</div>
            <Table>
              <thead><tr><Th>Row</Th>{MARKS_FIELDS.filter((f) => mapping[f]).map((f) => <Th key={f}>{MARKS_FIELD_LABELS[f]}</Th>)}</tr></thead>
              <tbody>{rows().slice(0, 8).map((r) => <tr key={r.rowNumber}><Td className="text-xs text-muted">{r.rowNumber}</Td>{MARKS_FIELDS.filter((f) => mapping[f]).map((f) => <Td key={f}>{String(r.values[f] ?? "")}</Td>)}</tr>)}</tbody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={missingRequired.length > 0 || validate.pending} onClick={() => void validate.run(payload()).then((r) => { if (r.ok && r.data) { setReport(r.data); setStage("validated"); } })}>
              <ShieldCheck /> {validate.pending ? "Validating…" : "Validate"}
            </Button>
            {missingRequired.length > 0 && <span className="text-xs text-amber-800">Map required columns: {missingRequired.map((f) => MARKS_FIELD_LABELS[f]).join(", ")}</span>}
            <ResultMessage result={validate.result?.ok ? null : validate.result} />
          </div>
        </>
      )}

      {report && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-5">
            {[["Rows", report.summary.totalRows], ["Valid", report.summary.validRows], ["Rows with errors", report.summary.errorRows], ["Students in file", report.summary.studentsInFile], ["Missing students", report.summary.missingStudents.length]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/70 p-2.5 ring-1 ring-line"><div className="text-[11px] text-muted">{k}</div><div className="text-lg font-semibold">{v}</div></div>
            ))}
          </div>
          {report.errors.length > 0 ? (
            <Alert tone="red" title={`${report.errors.length} error(s) — nothing can be saved until they are fixed`}>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-xs"><tbody>{report.errors.slice(0, 200).map((e, i) => <tr key={i} className="border-t border-rose-100"><td className="py-1 pr-3">Row {e.row}</td><td className="pr-3">{e.field}</td><td>{e.message}</td></tr>)}</tbody></table>
              </div>
            </Alert>
          ) : (
            <Alert tone="green" title="All records valid">{report.summary.validRows} marks ready to save.</Alert>
          )}
          {report.warnings.length > 0 && <Alert tone="amber" title="Warnings">{report.warnings.slice(0, 20).map((w, i) => <div key={i}>{w.row ? `Row ${w.row}: ` : ""}{w.message}</div>)}</Alert>}
          <div className="flex items-center gap-3">
            <Button disabled={report.errors.length > 0 || save.pending || stage === "saved"} onClick={() => void save.run(payload()).then((r) => { if (r.ok) { setStage("saved"); save.setResult({ ok: true, message: `${r.data?.saved} marks saved. Recalculate attainment on the Direct Attainment step.` }); } })}>
              <Upload /> Confirm & save
            </Button>
            {stage === "saved" && <CheckCircle2 className="size-5 text-emerald-600" />}
            <ResultMessage result={save.result} />
          </div>
        </div>
      )}
    </div>
  );
}
