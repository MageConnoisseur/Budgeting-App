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

function niceMax(values: number[]): number {
  const peak = Math.max(0, ...values)
  if (peak === 0) return 100
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  const normalized = peak / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function formatAxis(n: number): string {
  if (Math.abs(n) >= 1000) {
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
  const pad = { top: 16, right: 16, bottom: 36, left: 48 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const allValues = series.flatMap((s) => s.values)
  const maxY = niceMax(allValues)
  const n = Math.max(labels.length, 1)
  const xAt = (i: number) =>
    pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => pad.top + innerH - (v / maxY) * innerH

  return (
    <div className="chart-block">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trend line chart"
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

export function monthLabels(count = 12): string[] {
  return MONTH_SHORT.slice(0, count)
}
