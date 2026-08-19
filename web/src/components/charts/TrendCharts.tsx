import { formatUsd, MONTH_SHORT } from '../../lib/format'

export interface ChartSeries {
  key: string
  label: string
  color: string
  values: number[]
}

export interface NamedValue {
  label: string
  value: number
  color?: string
}

function niceAbsCeiling(value: number): number {
  const peak = Math.abs(value)
  if (peak === 0) return 0
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  const normalized = peak / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function niceMax(values: number[]): number {
  const peak = Math.max(0, ...values)
  if (peak === 0) return 100
  return niceAbsCeiling(peak)
}

/** Inclusive domain that grows with the data and always includes 0. */
function niceExtent(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 100 }
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const min = dataMin < 0 ? -niceAbsCeiling(dataMin) : 0
  const max = dataMax > 0 ? niceAbsCeiling(dataMax) : 0
  if (min === 0 && max === 0) return { min: 0, max: 100 }
  return { min, max }
}

function axisTicks(min: number, max: number): number[] {
  if (min < 0 && max > 0) return [min, 0, max]
  if (min < 0) return [min, min / 2, 0]
  return [0, max / 2, max]
}

function formatAxis(n: number): string {
  if (n < 0) return `-${formatAxis(-n)}`
  if (n >= 1000) {
    return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  }
  return `$${Math.round(n)}`
}

/** Multi-series line chart for month-to-month trends. */
export function LineTrendChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[]
  series: ChartSeries[]
  height?: number
}) {
  const width = 640
  const allValues = series.flatMap((s) => s.values)
  const { min: minY, max: maxY } = niceExtent(allValues)
  const spanY = maxY - minY || 1
  const pad = {
    top: 16,
    right: 16,
    bottom: 36,
    left: minY < 0 ? 56 : 48,
  }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const n = Math.max(labels.length, 1)
  const xAt = (i: number) =>
    pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => pad.top + innerH - ((v - minY) / spanY) * innerH
  const ticks = axisTicks(minY, maxY)

  return (
    <div className="chart-block">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trend line chart"
      >
        {ticks.map((tick) => {
          const y = yAt(tick)
          const isZero = tick === 0 && minY < 0
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                className={isZero ? 'chart-zero' : 'chart-grid'}
              />
              <text x={pad.left - 8} y={y + 4} className="chart-axis" textAnchor="end">
                {formatAxis(tick)}
              </text>
            </g>
          )
        })}
        {series.map((s) => {
          const points = s.values
            .map((v, i) => `${xAt(i)},${yAt(v)}`)
            .join(' ')
          return (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
                className="chart-line"
              />
              {s.values.map((v, i) => (
                <circle
                  key={`${s.key}-${i}`}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={3.5}
                  fill={s.color}
                >
                  <title>
                    {s.label} · {labels[i]}: {formatUsd(v)}
                  </title>
                </circle>
              ))}
            </g>
          )
        })}
        {labels.map((label, i) => (
          <text
            key={label}
            x={xAt(i)}
            y={height - 12}
            className="chart-axis"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
      </svg>
      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Grouped vertical bars — e.g. planned vs actual per month or category. */
export function GroupedBarChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[]
  series: ChartSeries[]
  height?: number
}) {
  const width = 640
  const pad = { top: 16, right: 12, bottom: 36, left: 48 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const maxY = niceMax(series.flatMap((s) => s.values))
  const groupCount = Math.max(labels.length, 1)
  const groupW = innerW / groupCount
  const barGap = 2
  const seriesCount = Math.max(series.length, 1)
  const barW = Math.max(4, (groupW - 10) / seriesCount - barGap)

  return (
    <div className="chart-block">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Grouped bar chart"
      >
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + innerH * (1 - t)
          return (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                className="chart-grid"
              />
              <text x={pad.left - 8} y={y + 4} className="chart-axis" textAnchor="end">
                {formatAxis(maxY * t)}
              </text>
            </g>
          )
        })}
        {labels.map((label, i) => {
          const groupX = pad.left + i * groupW + 5
          return (
            <g key={label}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0
                const h = maxY === 0 ? 0 : (v / maxY) * innerH
                const x = groupX + si * (barW + barGap)
                const y = pad.top + innerH - h
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, v > 0 ? 2 : 0)}
                    rx={3}
                    fill={s.color}
                    className="chart-bar"
                  >
                    <title>
                      {s.label} · {label}: {formatUsd(v)}
                    </title>
                  </rect>
                )
              })}
              <text
                x={groupX + (seriesCount * (barW + barGap)) / 2}
                y={height - 12}
                className="chart-axis"
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal bars for category comparisons. */
export function HorizontalBarChart({
  items,
  heightPerItem = 28,
  formatValue = formatUsd,
}: {
  items: NamedValue[]
  heightPerItem?: number
  formatValue?: (value: number) => string
}) {
  const width = 640
  const pad = { top: 8, right: 72, bottom: 8, left: 120 }
  const height = Math.max(80, items.length * heightPerItem + pad.top + pad.bottom)
  const innerW = width - pad.left - pad.right
  const maxX = niceMax(items.map((i) => Math.abs(i.value)))

  return (
    <div className="chart-block">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Category comparison chart"
      >
        {items.map((item, i) => {
          const y = pad.top + i * heightPerItem + 4
          const barH = heightPerItem - 10
          const w = maxX === 0 ? 0 : (Math.abs(item.value) / maxX) * innerW
          return (
            <g key={`${item.label}-${i}`}>
              <text
                x={pad.left - 10}
                y={y + barH / 2 + 4}
                className="chart-axis"
                textAnchor="end"
              >
                {item.label.length > 16
                  ? `${item.label.slice(0, 15)}…`
                  : item.label}
              </text>
              <rect
                x={pad.left}
                y={y}
                width={Math.max(w, item.value !== 0 ? 2 : 0)}
                height={barH}
                rx={4}
                fill={item.color ?? 'var(--moss)'}
                className="chart-bar"
              >
                <title>
                  {item.label}: {formatValue(item.value)}
                </title>
              </rect>
              <text
                x={pad.left + w + 8}
                y={y + barH / 2 + 4}
                className="chart-axis"
              >
                {formatValue(item.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export interface PlanActualItem {
  id: string
  label: string
  planned: number
  actual: number
}

const OVERLAP_COLORS = {
  planned: '#8aa396',
  actual: '#7a3b2e',
  over: '#9a4b1f',
  track: '#dfe8e1',
}

function truncateLabel(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

/**
 * Overlapping horizontal bars: planned (back) + actual (front) on one shared $ axis.
 * Over-plan spill uses a soft warning color past the planned edge.
 */
export function OverlappingPlanActualChart({
  items,
  heightPerItem = 36,
  plannedColor = OVERLAP_COLORS.planned,
  actualColor = OVERLAP_COLORS.actual,
  overColor = OVERLAP_COLORS.over,
  ariaLabel = 'Plan versus actual by category',
}: {
  items: PlanActualItem[]
  heightPerItem?: number
  plannedColor?: string
  actualColor?: string
  overColor?: string
  ariaLabel?: string
}) {
  const width = 720
  const pad = { top: 10, right: 148, bottom: 10, left: 118 }
  const height = Math.max(72, items.length * heightPerItem + pad.top + pad.bottom)
  const innerW = width - pad.left - pad.right
  const maxX = niceMax(items.map((i) => Math.max(i.planned, i.actual, 0)))

  if (items.length === 0) return null

  return (
    <div className="chart-block overlap-chart-block">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {items.map((item, i) => {
          const y = pad.top + i * heightPerItem + 5
          const barH = heightPerItem - 14
          const actualH = Math.max(6, barH - 6)
          const actualY = y + (barH - actualH) / 2
          const plannedW =
            maxX === 0 ? 0 : (Math.max(0, item.planned) / maxX) * innerW
          const actualW =
            maxX === 0 ? 0 : (Math.max(0, item.actual) / maxX) * innerW
          const withinW = Math.min(actualW, plannedW)
          const overW = Math.max(0, actualW - plannedW)
          const overPlan = item.actual > item.planned && item.actual > 0
          const pct =
            item.planned > 0
              ? Math.round((item.actual / item.planned) * 100)
              : item.actual > 0
                ? null
                : 0
          const pctLabel =
            pct === null ? 'no plan' : `${pct}%`
          const valueLabel = `${formatUsd(item.actual)} / ${formatUsd(item.planned)}`

          return (
            <g key={item.id}>
              <text
                x={pad.left - 10}
                y={y + barH / 2 + 4}
                className="chart-axis"
                textAnchor="end"
              >
                {truncateLabel(item.label)}
              </text>
              <rect
                x={pad.left}
                y={y}
                width={innerW}
                height={barH}
                rx={5}
                fill={OVERLAP_COLORS.track}
                className="chart-track"
              />
              <rect
                x={pad.left}
                y={y}
                width={Math.max(plannedW, item.planned > 0 ? 2 : 0)}
                height={barH}
                rx={5}
                fill={plannedColor}
                className="chart-bar chart-bar-planned"
              >
                <title>
                  {item.label} planned: {formatUsd(item.planned)}
                </title>
              </rect>
              <rect
                x={pad.left}
                y={actualY}
                width={Math.max(withinW, item.actual > 0 && !overPlan ? 2 : 0)}
                height={actualH}
                rx={4}
                fill={actualColor}
                className="chart-bar chart-bar-actual"
              >
                <title>
                  {item.label} actual: {formatUsd(item.actual)} ({pctLabel})
                </title>
              </rect>
              {overW > 0 && (
                <rect
                  x={pad.left + plannedW}
                  y={actualY}
                  width={Math.max(overW, 2)}
                  height={actualH}
                  rx={4}
                  fill={overColor}
                  className="chart-bar chart-bar-over"
                >
                  <title>
                    {item.label} over plan by{' '}
                    {formatUsd(item.actual - item.planned)}
                  </title>
                </rect>
              )}
              <text
                x={width - pad.right + 10}
                y={y + barH / 2 - 2}
                className="chart-value-primary"
              >
                {valueLabel}
              </text>
              <text
                x={width - pad.right + 10}
                y={y + barH / 2 + 11}
                className={`chart-value-secondary${overPlan ? ' is-over' : ''}`}
              >
                {pctLabel}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="chart-legend">
        <li>
          <span className="swatch" style={{ background: plannedColor }} />
          Planned
        </li>
        <li>
          <span className="swatch" style={{ background: actualColor }} />
          Actual
        </li>
        <li>
          <span className="swatch" style={{ background: overColor }} />
          Over plan
        </li>
      </ul>
    </div>
  )
}

/** Split categories into major vs smaller bands for readable shared-$ charts. */
export function bandByMagnitude<T extends { planned: number; actual: number }>(
  items: T[],
  {
    shareOfPeak = 0.15,
    minCountToSplit = 4,
  }: { shareOfPeak?: number; minCountToSplit?: number } = {},
): { major: T[]; smaller: T[] } {
  const sorted = [...items].sort(
    (a, b) =>
      Math.max(b.planned, b.actual) - Math.max(a.planned, a.actual),
  )
  if (sorted.length < minCountToSplit) {
    return { major: sorted, smaller: [] }
  }
  const peak = Math.max(0, ...sorted.map((i) => Math.max(i.planned, i.actual)))
  if (peak <= 0) {
    return { major: sorted, smaller: [] }
  }
  const threshold = peak * shareOfPeak
  const major = sorted.filter((i) => Math.max(i.planned, i.actual) >= threshold)
  const smaller = sorted.filter((i) => Math.max(i.planned, i.actual) < threshold)
  // Keep a single band when the split is empty or too thin to help.
  if (major.length === 0 || smaller.length === 0) {
    return { major: sorted, smaller: [] }
  }
  // Need at least two majors so the shared-$ comparison still matters;
  // a single small category is still worth its own scale.
  if (major.length < 2) {
    return { major: sorted, smaller: [] }
  }
  return { major, smaller }
}

export function monthLabels(count = 12): string[] {
  return MONTH_SHORT.slice(0, count)
}
