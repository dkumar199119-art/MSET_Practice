"use client";
import { useState } from "react";
import { Save } from "lucide-react";
import { saveBloomAction } from "@/app/actions/workspace";
import { BLOOM_LABELS, BLOOM_LEVELS, checkMeasurability, type BloomLevel } from "@/lib/domain/bloom";
import { Button } from "@/components/ui/button";
import { ResultMessage, useServerAction } from "@/components/ui/action";
import { Card, CardBody, CardHeader, Select, Table, Td, Th, Empty } from "@/components/ui/primitives";

export function BloomEditor({ offeringId, readOnly, cos }: { offeringId: string; readOnly: boolean; cos: { id: string; code: string; description: string; bloom_level: string | null }[] }) {
  const [levels, setLevels] = useState<Record<string, BloomLevel | "">>(Object.fromEntries(cos.map((c) => [c.id, (c.bloom_level as BloomLevel) ?? ""])));
  const save = useServerAction(saveBloomAction);
  const dist = BLOOM_LEVELS.map((b) => ({ b, n: Object.values(levels).filter((l) => l === b).length }));
  const max = Math.max(1, ...dist.map((d) => d.n));
  if (!cos.length) return <Empty title="Define course outcomes first" />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="5 · Bloom's Taxonomy" description="Assign the cognitive level of every CO. The detected level comes from the statement's action verb." />
        <CardBody>
          <Table>
            <thead><tr><Th>CO</Th><Th>Statement</Th><Th>Detected from verb</Th><Th className="w-52">Bloom level</Th></tr></thead>
            <tbody>
              {cos.map((c) => {
                const chk = checkMeasurability(c.description);
                return (
                  <tr key={c.id}>
                    <Td className="font-semibold text-violet-800">{c.code}</Td>
                    <Td className="text-ink-2">{c.description}</Td>
                    <Td className="text-xs">{chk.detectedLevel ? `${BLOOM_LABELS[chk.detectedLevel]} (“${chk.verb}”)` : <span className="text-amber-700">no action verb</span>}</Td>
                    <Td>
                      <Select aria-label={`${c.code} Bloom level`} disabled={readOnly} value={levels[c.id]} onChange={(e) => setLevels({ ...levels, [c.id]: e.target.value as BloomLevel })}>
                        <option value="">— select —</option>
                        {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{BLOOM_LABELS[b]}</option>)}
                      </Select>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Cognitive level distribution" description="Number of COs at each Bloom level" />
        <CardBody>
          <div className="space-y-1.5" role="table" aria-label="Bloom distribution">
            {dist.map((d) => (
              <div key={d.b} role="row" className="flex items-center gap-3 text-sm">
                <span role="cell" className="w-28 text-ink-2">{BLOOM_LABELS[d.b]}</span>
                <span role="cell" className="flex-1"><span className="block h-3 rounded-r bg-[var(--color-series-1)]" style={{ width: `${(d.n / max) * 100}%`, minWidth: d.n ? 6 : 0 }} /></span>
                <span role="cell" className="tabular w-6 text-right">{d.n}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button disabled={save.pending || Object.values(levels).some((l) => !l)} onClick={() => void save.run({ offeringId, levels: levels as Record<string, BloomLevel> })}><Save /> Save Bloom levels</Button>
          <ResultMessage result={save.result} />
        </div>
      )}
    </div>
  );
}
