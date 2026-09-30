"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

export interface CoPoint { code: string; direct: number | null; indirect: number | null; final: number | null; target: number }

const INK = "#4b4868";
const GRID = "#e7e5ef";

function TargetTick(props: { cx?: number; cy?: number }) {
  const { cx = 0, cy = 0 } = props;
  return <line x1={cx - 22} x2={cx + 22} y1={cy} y2={cy} stroke="#1e1b3a" strokeWidth={2} strokeLinecap="round" />;
}

/** Direct / indirect / final CO attainment against the CO target (ink tick). */
export function AttainmentChart({ data, height = 280 }: { data: CoPoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="CO attainment chart: direct, indirect and final attainment per CO with target markers">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="code" tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: "#c9c6d8" }} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#7c7a95", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
          <Tooltip cursor={{ fill: "rgba(124,58,237,0.06)" }} formatter={(v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(2)}%`)}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2d9fd", fontSize: 12 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK }} />
          <Bar dataKey="direct" name="Direct" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="indirect" name="Indirect" fill="var(--color-series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="final" name="Final" fill="var(--color-series-3)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Scatter dataKey="target" name="Target" fill="#1e1b3a" shape={<TargetTick />} legendType="line" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
