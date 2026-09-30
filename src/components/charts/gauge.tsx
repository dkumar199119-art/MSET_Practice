/** Radial meter: value arc against a target tick. Pure SVG (server-renderable). */
export function Gauge({ value, target, label, size = 140 }: { value: number | null; target: number; label: string; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const arc = 0.75; // 270° sweep
  const v = Math.max(0, Math.min(100, value ?? 0));
  const tone = value === null ? "#c9c6d8" : v >= target ? "#0ca30c" : v >= target - 5 ? "#fab219" : v >= target - 15 ? "#ec835a" : "#d03b3b";
  const angle = (135 + (target / 100) * 270) * (Math.PI / 180);
  const cx = size / 2, cy = size / 2;
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${value === null ? "not available" : `${v.toFixed(1)}%`} against target ${target}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#efeafe" strokeWidth={10} strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={tone} strokeWidth={10} strokeDasharray={`${c * arc * (v / 100)} ${c}`} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
        <line x1={cx + (r - 9) * Math.cos(angle)} y1={cy + (r - 9) * Math.sin(angle)} x2={cx + (r + 9) * Math.cos(angle)} y2={cy + (r + 9) * Math.sin(angle)} stroke="#1e1b3a" strokeWidth={2} strokeLinecap="round" />
        <text x={cx} y={cy + 2} textAnchor="middle" className="fill-[#1e1b3a] text-[22px] font-semibold">{value === null ? "—" : `${v.toFixed(1)}%`}</text>
        <text x={cx} y={cy + 20} textAnchor="middle" className="fill-[#7c7a95] text-[10px]">target {target}%</text>
      </svg>
      <figcaption className="-mt-3 text-xs font-medium text-ink-2">{label}</figcaption>
    </figure>
  );
}
