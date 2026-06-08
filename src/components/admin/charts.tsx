"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Theme-aligned chart palette (warm navy + terracotta).
export const CHART_COLORS = {
  navy: "#06264e",
  terracotta: "#c08967",
  sand: "#e7c9ad",
  gold: "#d9a76c",
  slate: "#8a8079",
};

// ── useMeasure: track the rendered width so SVGs draw in real pixels
// (crisp, undistorted text + accurate hover math). ───────────────────
function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ── Donut ────────────────────────────────────────────────────────────

interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  // Guard full circle (an arc of exactly 360° won't render).
  const sweep = end - start;
  if (sweep >= 359.999) end = start + 359.999;
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = sweep <= 180 ? "0" : "1";
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export function DonutChart({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  centerSub,
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;

  let cursor = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const frac = d.value / total;
      const start = cursor * 360;
      cursor += frac;
      const end = cursor * 360;
      return { ...d, start, end };
    });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments.map((seg, i) => (
            <path
              key={i}
              d={arcPath(cx, cy, r, seg.start, seg.end)}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
            />
          ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerLabel != null && (
          <span className="text-2xl font-semibold tabular-nums leading-tight text-foreground">
            {centerLabel}
          </span>
        )}
        {centerSub != null && (
          <span className="text-xs text-muted-foreground">{centerSub}</span>
        )}
      </div>
    </div>
  );
}

// ── Trend (area + line) with hover tooltip ───────────────────────────

interface TrendPoint {
  label: string;
  value: number;
}

export function TrendChart({
  data,
  color = CHART_COLORS.navy,
  formatValue = (v) => String(v),
  height = 200,
}: {
  data: TrendPoint[];
  color?: string;
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padX = 8;
  const padTop = 16;
  const padBottom = 26;
  const w = Math.max(width, 1);
  const innerW = w - padX * 2;
  const innerH = height - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const xAt = (i: number) => padX + stepX * i;
  const yAt = (v: number) => padTop + innerH - (v / max) * innerH;

  const linePts = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(" ");
  const areaPath =
    n > 0
      ? `M ${xAt(0)},${yAt(data[0].value)} ` +
        data.map((d, i) => `L ${xAt(i)},${yAt(d.value)}`).join(" ") +
        ` L ${xAt(n - 1)},${padTop + innerH} L ${xAt(0)},${padTop + innerH} Z`
      : "";

  const gradId = `trend-grad-${color.replace("#", "")}`;

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (n === 0 || stepX === 0) {
        setHover(n > 0 ? 0 : null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - padX;
      const idx = Math.round(x / stepX);
      setHover(Math.min(n - 1, Math.max(0, idx)));
    },
    [n, stepX]
  );

  // Label every Nth tick so they never collide on small widths.
  const labelEvery = n > 8 ? Math.ceil(n / 6) : 1;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          className="touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* horizontal gridlines */}
          {[0, 0.5, 1].map((g) => (
            <line
              key={g}
              x1={padX}
              x2={w - padX}
              y1={padTop + innerH * g}
              y2={padTop + innerH * g}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={g === 1 ? "0" : "3 4"}
              opacity={g === 1 ? 0.9 : 0.5}
            />
          ))}

          {n > 0 && <path d={areaPath} fill={`url(#${gradId})`} />}
          {n > 1 && (
            <polyline
              points={linePts}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* x labels */}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text
                key={i}
                x={xAt(i)}
                y={height - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {d.label}
              </text>
            ) : null
          )}

          {/* hover guide + dot */}
          {hover != null && data[hover] && (
            <>
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={padTop}
                y2={padTop + innerH}
                stroke={color}
                strokeWidth={1}
                opacity={0.4}
              />
              <circle
                cx={xAt(hover)}
                cy={yAt(data[hover].value)}
                r={4}
                fill={color}
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      )}

      {hover != null && data[hover] && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-center shadow-md"
          style={{
            left: Math.min(Math.max(xAt(hover), 48), w - 48),
            top: 0,
          }}
        >
          <div className="text-[11px] text-muted-foreground">{data[hover].label}</div>
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {formatValue(data[hover].value)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Horizontal bar list ──────────────────────────────────────────────

export function BarList({
  items,
}: {
  items: { label: string; value: number; valueLabel: string; sublabel?: string; color: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
              {item.sublabel && (
                <span className="text-xs font-normal text-muted-foreground">
                  {item.sublabel}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums font-semibold text-foreground">
              {item.valueLabel}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
                minWidth: item.value > 0 ? 6 : 0,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
