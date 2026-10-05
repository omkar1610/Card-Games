"use client";

// A die face (1–6 pips). `rolling` adds a short tumble animation.
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

export default function Dice({ value, rolling, size = 46 }: { value: number | null; rolling?: boolean; size?: number }) {
  return (
    <svg className={`die ${rolling ? "rolling" : ""}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={value ? `Die showing ${value}` : "Die"}>
      <rect x="4" y="4" width="92" height="92" rx="18" fill="var(--card-face)" stroke="var(--gold-line)" strokeWidth="3" />
      {(value ? PIPS[value] : []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill="var(--card-ink)" />
      ))}
    </svg>
  );
}
