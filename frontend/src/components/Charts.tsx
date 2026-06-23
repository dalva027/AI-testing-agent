import { useId, useRef, useState } from 'react'
import { useTheme } from '../App'

/* ------------------------------------------------------------------ *
 * Lightweight, dependency-free SVG charts.
 * All drawing happens in a fixed viewBox coordinate space; the <svg>
 * scales to its container via width:100%. Mouse positions are mapped
 * back into viewBox space with getScreenCTM so tooltips line up at any
 * size.
 * ------------------------------------------------------------------ */

export type Point = { label: string; value: number }

function useChartColors() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  return {
    axis: dark ? '#94a3b8' : '#9ca3af',
    grid: dark ? '#334155' : '#e5e7eb',
    surface: dark ? '#1e293b' : '#ffffff',
    text: dark ? '#f1f5f9' : '#111827',
    subtext: dark ? '#cbd5e1' : '#4b5563',
  }
}

function svgCoords(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function niceDomain(values: number[], clampMin?: number, clampMax?: number): [number, number] {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (!isFinite(min) || !isFinite(max)) return [0, 1]
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.15
  min -= pad
  max += pad
  if (clampMin !== undefined) min = Math.max(min, clampMin)
  if (clampMax !== undefined) max = Math.min(max, clampMax)
  if (min === max) max = min + 1
  return [min, max]
}

function ticks(min: number, max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => min + (i * (max - min)) / count)
}

function labelIndices(n: number, max = 7): Set<number> {
  if (n <= max) return new Set(Array.from({ length: n }, (_, i) => i))
  const step = (n - 1) / (max - 1)
  const s = new Set<number>()
  for (let i = 0; i < max; i++) s.add(Math.round(i * step))
  return s
}

// Catmull-Rom -> cubic Bézier for smooth curves.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function EmptyChart({ height = 240 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-gray-400"
      style={{ height }}
    >
      Not enough data yet
    </div>
  )
}

/* ============================== Trend (line / area) ============================== */

interface TrendChartProps {
  data: Point[]
  color?: string
  area?: boolean
  fmt?: (v: number) => string
  valueLabel?: string
  clampMin?: number
  clampMax?: number
}

export function TrendChart({
  data,
  color = '#7c3aed',
  area = false,
  fmt = v => String(Math.round(v)),
  valueLabel = 'Value',
  clampMin,
  clampMax,
}: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gradId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const C = useChartColors()

  if (data.length === 0) return <EmptyChart />

  const W = 600
  const H = 240
  const m = { top: 16, right: 16, bottom: 28, left: 44 }
  const iw = W - m.left - m.right
  const ih = H - m.top - m.bottom

  const [yMin, yMax] = niceDomain(data.map(d => d.value), clampMin, clampMax)
  const xAt = (i: number) => (data.length === 1 ? m.left + iw / 2 : m.left + (i / (data.length - 1)) * iw)
  const yAt = (v: number) => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value) }))
  const line = smoothPath(pts)
  const areaPath = `${line} L ${pts[pts.length - 1].x} ${m.top + ih} L ${pts[0].x} ${m.top + ih} Z`
  const yTicks = ticks(yMin, yMax)
  const showLabel = labelIndices(data.length)

  const onMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return
    const { x } = svgCoords(svgRef.current, e.clientX, e.clientY)
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(xAt(i) - x)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    setHover(best)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 'auto' }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* gridlines + y labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={m.left} y1={yAt(t)} x2={W - m.right} y2={yAt(t)} stroke={C.grid} strokeWidth="1" strokeDasharray="3 3" />
          <text x={m.left - 8} y={yAt(t) + 4} textAnchor="end" fontSize="11" fill={C.axis}>
            {fmt(t)}
          </text>
        </g>
      ))}

      {/* x labels */}
      {data.map((d, i) =>
        showLabel.has(i) ? (
          <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={C.axis}>
            {d.label}
          </text>
        ) : null
      )}

      {area && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* hover guide + tooltip */}
      {hover !== null && (
        <Tooltip
          x={pts[hover].x}
          y={pts[hover].y}
          color={color}
          chartLeft={m.left}
          chartRight={W - m.right}
          lines={[data[hover].label, `${valueLabel}: ${fmt(data[hover].value)}`]}
          guideTop={m.top}
          guideBottom={m.top + ih}
        />
      )}
    </svg>
  )
}

/* ============================== Stacked bars ============================== */

export type BarDatum = { label: string; passed: number; failed: number }

export function StackedBarChart({ data }: { data: BarDatum[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const C = useChartColors()

  if (data.length === 0) return <EmptyChart />

  const W = 600
  const H = 240
  const m = { top: 16, right: 16, bottom: 28, left: 44 }
  const iw = W - m.left - m.right
  const ih = H - m.top - m.bottom

  const maxTotal = Math.max(1, ...data.map(d => d.passed + d.failed))
  const yMax = Math.ceil(maxTotal / 4) * 4 || 4
  const yAt = (v: number) => m.top + ih - (v / yMax) * ih

  const slot = iw / data.length
  const barW = Math.min(34, slot * 0.62)
  const xCenter = (i: number) => m.left + slot * i + slot / 2
  const yTicks = ticks(0, yMax)
  const showLabel = labelIndices(data.length)

  const onMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return
    const { x } = svgCoords(svgRef.current, e.clientX, e.clientY)
    const i = Math.floor((x - m.left) / slot)
    setHover(i >= 0 && i < data.length ? i : null)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 'auto' }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={m.left} y1={yAt(t)} x2={W - m.right} y2={yAt(t)} stroke={C.grid} strokeWidth="1" strokeDasharray="3 3" />
          <text x={m.left - 8} y={yAt(t) + 4} textAnchor="end" fontSize="11" fill={C.axis}>
            {Math.round(t)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const x = xCenter(i) - barW / 2
        const passedH = (d.passed / yMax) * ih
        const failedH = (d.failed / yMax) * ih
        const dim = hover !== null && hover !== i
        return (
          <g key={i} opacity={dim ? 0.45 : 1}>
            {/* passed (bottom) */}
            {d.passed > 0 && (
              <rect x={x} y={m.top + ih - passedH} width={barW} height={passedH} rx="2" fill="#22c55e" />
            )}
            {/* failed (top) */}
            {d.failed > 0 && (
              <rect x={x} y={m.top + ih - passedH - failedH} width={barW} height={failedH} rx="2" fill="#ef4444" />
            )}
            {showLabel.has(i) && (
              <text x={xCenter(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={C.axis}>
                {d.label}
              </text>
            )}
          </g>
        )
      })}

      {hover !== null && (
        <Tooltip
          x={xCenter(hover)}
          y={yAt(data[hover].passed + data[hover].failed)}
          color="#22c55e"
          chartLeft={m.left}
          chartRight={W - m.right}
          lines={[
            data[hover].label,
            `Passed: ${data[hover].passed}`,
            `Failed: ${data[hover].failed}`,
          ]}
        />
      )}
    </svg>
  )
}

/* ============================== Donut ============================== */

export type DonutDatum = { label: string; value: number; color: string }

export function DonutChart({ data }: { data: DonutDatum[] }) {
  const C = useChartColors()
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <EmptyChart height={220} />

  const size = 220
  const cx = size / 2
  const cy = size / 2
  const rOuter = 92
  const rInner = 58

  const arc = (a0: number, a1: number) => {
    const pol = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [x0, y0] = pol(rOuter, a0)
    const [x1, y1] = pol(rOuter, a1)
    const [x2, y2] = pol(rInner, a1)
    const [x3, y3] = pol(rInner, a0)
    return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`
  }

  let angle = -Math.PI / 2
  const slices = data.map(d => {
    const frac = d.value / total
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    return { ...d, a0, a1, frac }
  })

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-44 h-44 shrink-0">
        {slices.length === 1 ? (
          <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke={slices[0].color} strokeWidth={rOuter - rInner} />
        ) : (
          slices.map((s, i) => <path key={i} d={arc(s.a0, s.a1)} fill={s.color} />)
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="30" fontWeight="700" fill={C.text}>
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="12" fill={C.axis}>
          tests
        </text>
      </svg>

      <div className="grid grid-cols-1 gap-2 w-full sm:w-auto">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-700 capitalize flex-1">{s.label}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{s.value}</span>
            <span className="text-gray-400 text-xs w-10 text-right tabular-nums">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================== Shared SVG tooltip ============================== */

interface TooltipProps {
  x: number
  y: number
  color: string
  lines: string[]
  chartLeft: number
  chartRight: number
  guideTop?: number
  guideBottom?: number
}

function Tooltip({ x, y, color, lines, chartLeft, chartRight, guideTop, guideBottom }: TooltipProps) {
  const C = useChartColors()
  const padX = 10
  const lineH = 16
  const boxW = Math.max(96, ...lines.map(l => l.length * 6.3)) + padX * 2
  const boxH = lines.length * lineH + 12
  // Prefer placing the box to the right of the point; flip if it would overflow.
  let bx = x + 12
  if (bx + boxW > chartRight) bx = x - 12 - boxW
  bx = Math.max(chartLeft, bx)
  let by = y - boxH - 8
  if (by < 0) by = y + 8

  return (
    <g pointerEvents="none">
      {guideTop !== undefined && guideBottom !== undefined && (
        <line x1={x} y1={guideTop} x2={x} y2={guideBottom} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      )}
      <circle cx={x} cy={y} r="4" fill={color} stroke={C.surface} strokeWidth="2" />
      <rect x={bx} y={by} width={boxW} height={boxH} rx="8" fill={C.surface} stroke={C.grid} strokeWidth="1" />
      {lines.map((l, i) => (
        <g key={i}>
          {i === 0 ? (
            <text x={bx + padX} y={by + 16 + i * lineH} fontSize="11" fontWeight="600" fill={C.text}>
              {l}
            </text>
          ) : (
            <>
              <circle cx={bx + padX + 3} cy={by + 12 + i * lineH} r="3" fill={color} />
              <text x={bx + padX + 12} y={by + 16 + i * lineH} fontSize="11" fill={C.subtext}>
                {l}
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  )
}
