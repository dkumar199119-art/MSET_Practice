"use client";
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

export interface CoPoint { code: string; direct: number | null; indirect: number | null; final: number | null; target: number }

const INK = "#4b4868";
const GRID = "#e7e5ef";
const SERIES = [
  { key: "direct", label: "Direct", color: "var(--color-series-1)" },
  { key: "indirect", label: "Indirect", color: "var(--color-series-2)" },
  { key: "final", label: "Final", color: "var(--color-series-3)" },
] as const;
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(2)}%`);

function TargetTick(props: { cx?: number; cy?: number }) {
  const { cx = 0, cy = 0 } = props;
  return <line x1={cx - 22} x2={cx + 22} y1={cy} y2={cy} stroke="#1e1b3a" strokeWidth={2} strokeLinecap="round" />;
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: CoPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-lavender-200 bg-white/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{d.code}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
          <span className="w-14">{s.label}</span><span className="tabular font-medium text-ink">{pct(d[s.key])}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 text-ink-2"><span className="inline-block h-0.5 w-2 bg-ink" /><span className="w-14">Target</span><span className="tabular font-medium text-ink">{pct(d.target)}</span></div>
    </div>
  );
}

/** Direct / indirect / final CO attainment against the CO target (ink tick). */
export function AttainmentChart({ data, height = 280 }: { data: CoPoint[]; height?: number }) {
  return (
    <figure>
      <div style={{ height }} role="img" aria-label="CO attainment chart: direct, indirect and final attainment per CO with target markers">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="code" tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: "#c9c6d8" }} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#7c7a95", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip cursor={{ fill: "rgba(124,58,237,0.06)" }} content={<Tip />} />
            {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />)}
            <Scatter dataKey="target" name="Target" fill="#1e1b3a" shape={<TargetTick />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-ink-2">
        {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 bg-ink" />Target</span>
      </figcaption>
    </figure>
  );
}
