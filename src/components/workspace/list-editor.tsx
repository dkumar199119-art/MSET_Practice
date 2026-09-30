"use client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const n = [...arr];
  const [x] = n.splice(i, 1);
  n.splice(i + d, 0, x);
  return n;
}

export function RowControls({ i, n, onMove, onDelete, readOnly }: { i: number; n: number; onMove: (d: -1 | 1) => void; onDelete: () => void; readOnly: boolean }) {
  if (readOnly) return null;
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
      <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
      <Button type="button" size="icon" variant="ghost" aria-label="Delete" onClick={onDelete}><Trash2 /></Button>
    </div>
  );
}
