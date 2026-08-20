import type { DashboardWidget } from '../types/api'
import {
  GRID_COLS,
  GRID_GAP_PX,
  GRID_ROW_PX,
  catalogForView,
  definitionFor,
  type GridRect,
  type WidgetDefinition,
} from './catalog'
import { widgetsForTheme } from './presets'
import type { ViewMode } from '../types/api'

export type { GridRect }

function asInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback
}

export function isHidden(widget: DashboardWidget): boolean {
  return widget.config.hidden === true
}

export function getRect(
  widget: DashboardWidget,
  fallback: GridRect,
): GridRect {
  const x = asInt(widget.config.x, Number.NaN)
  const y = asInt(widget.config.y, Number.NaN)
  const w = asInt(widget.config.w, Number.NaN)
  const h = asInt(widget.config.h, Number.NaN)
  if ([x, y, w, h].some((n) => !Number.isFinite(n))) return fallback
  return clampRect({ x, y, w, h })
}

export function hasRect(widget: DashboardWidget): boolean {
  return (
    typeof widget.config.x === 'number' &&
    typeof widget.config.y === 'number' &&
    typeof widget.config.w === 'number' &&
    typeof widget.config.h === 'number'
  )
}

export function clampRect(rect: GridRect): GridRect {
  const w = Math.max(1, Math.min(GRID_COLS, rect.w))
  const h = Math.max(1, rect.h)
  const x = Math.max(0, Math.min(GRID_COLS - w, rect.x))
  const y = Math.max(0, rect.y)
  return { x, y, w, h }
}

export function overlaps(a: GridRect, b: GridRect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

export type PlacedWidget = DashboardWidget & { rect: GridRect }

function withConfig(
  widget: DashboardWidget,
  patch: Record<string, unknown>,
): DashboardWidget {
  return { ...widget, config: { ...widget.config, ...patch } }
}

function stripLayout(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config }
  delete next.x
  delete next.y
  delete next.w
  delete next.h
  delete next.hidden
  return next
}

export function setHidden(
  widget: DashboardWidget,
  hidden: boolean,
): DashboardWidget {
  return withConfig(widget, { hidden })
}

export function setRect(
  widget: DashboardWidget,
  rect: GridRect,
): DashboardWidget {
  const next = clampRect(rect)
  return withConfig(widget, {
    x: next.x,
    y: next.y,
    w: next.w,
    h: next.h,
  })
}

function defaultRect(def: WidgetDefinition | undefined): GridRect {
  const size = def?.defaultSize ?? { w: GRID_COLS, h: 4 }
  return { x: 0, y: 0, w: size.w, h: size.h }
}

export function autoPlace(
  occupied: GridRect[],
  size: Pick<GridRect, 'w' | 'h'>,
): GridRect {
  const w = Math.max(1, Math.min(GRID_COLS, size.w))
  const h = Math.max(1, size.h)
  for (let y = 0; y < 240; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      const cand = { x, y, w, h }
      if (!occupied.some((r) => overlaps(r, cand))) return cand
    }
  }
  const maxY = occupied.reduce((m, r) => Math.max(m, r.y + r.h), 0)
  return { x: 0, y: maxY, w, h }
}

/**
 * Assign grid positions to widgets that lack them, packing in `order`
 * so Income / Expenses / Savings land side by side by default.
 */
export function ensureLayout(
  widgets: DashboardWidget[],
  view: ViewMode,
): DashboardWidget[] {
  const catalog = catalogForView(view)
  const sorted = [...widgets].sort((a, b) => a.order - b.order)
  const occupied: GridRect[] = []
  const placed: DashboardWidget[] = []

  for (const widget of sorted) {
    if (isHidden(widget)) {
      placed.push(widget)
      continue
    }
    const def = definitionFor(widget.id) ?? catalog.find((d) => d.type === widget.type)
    if (hasRect(widget)) {
      const rect = getRect(widget, defaultRect(def))
      occupied.push(rect)
      placed.push(setRect(widget, rect))
      continue
    }
    const rect = autoPlace(occupied, def?.defaultSize ?? { w: GRID_COLS, h: 4 })
    occupied.push(rect)
    placed.push(setRect(widget, rect))
  }
  return placed
}

export function visiblePlaced(widgets: DashboardWidget[]): PlacedWidget[] {
  return widgets
    .filter((w) => !isHidden(w) && hasRect(w))
    .map((w) => ({ ...w, rect: getRect(w, { x: 0, y: 0, w: GRID_COLS, h: 4 }) }))
}

export function resolveCollisions(
  items: PlacedWidget[],
  priorityId?: string,
): PlacedWidget[] {
  const list = [...items].sort((a, b) => {
    if (priorityId && a.id === priorityId) return -1
    if (priorityId && b.id === priorityId) return 1
    return a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.order - b.order
  })
  const placed: PlacedWidget[] = []
  for (const item of list) {
    const next = { ...item, rect: clampRect(item.rect) }
    let safety = 0
    while (placed.some((p) => overlaps(p.rect, next.rect)) && safety < 240) {
      safety += 1
      const hit = placed.find((p) => overlaps(p.rect, next.rect))
      if (!hit) break
      next.rect = { ...next.rect, y: hit.rect.y + hit.rect.h }
    }
    placed.push(next)
  }
  return placed
}

function readingOrder(widgets: DashboardWidget[]): DashboardWidget[] {
  return [...widgets]
    .sort((a, b) => {
      if (isHidden(a) !== isHidden(b)) return isHidden(a) ? 1 : -1
      const ar = hasRect(a) ? getRect(a, { x: 0, y: 0, w: 1, h: 1 }) : null
      const br = hasRect(b) ? getRect(b, { x: 0, y: 0, w: 1, h: 1 }) : null
      if (ar && br) return ar.y - br.y || ar.x - br.x
      return a.order - b.order
    })
    .map((w, i) => ({ ...w, order: i }))
}

export function applyPlacement(
  widgets: DashboardWidget[],
  placed: PlacedWidget[],
): DashboardWidget[] {
  const byId = new Map(placed.map((p) => [p.id, p.rect]))
  const next = widgets.map((w) => {
    const rect = byId.get(w.id)
    return rect ? setRect(w, rect) : w
  })
  return readingOrder(next)
}

export function moveWidget(
  widgets: DashboardWidget[],
  id: string,
  rect: GridRect,
): DashboardWidget[] {
  const current = visiblePlaced(widgets).map((w) =>
    w.id === id ? { ...w, rect: clampRect(rect) } : w,
  )
  return applyPlacement(widgets, resolveCollisions(current, id))
}

export function minSizeFor(id: string): Pick<GridRect, 'w' | 'h'> {
  return definitionFor(id)?.minSize ?? { w: 3, h: 3 }
}

export function pointToCell(
  clientX: number,
  clientY: number,
  grid: DOMRect,
  cols = GRID_COLS,
  rowPx = GRID_ROW_PX,
  gapPx = GRID_GAP_PX,
): { x: number; y: number } {
  const innerW = grid.width - gapPx * (cols - 1)
  const colW = innerW / cols
  const x = Math.round((clientX - grid.left) / (colW + gapPx))
  const y = Math.round((clientY - grid.top) / (rowPx + gapPx))
  return {
    x: Math.max(0, Math.min(cols - 1, x)),
    y: Math.max(0, y),
  }
}

export function newWidgetFromDefinition(def: WidgetDefinition): DashboardWidget {
  return {
    id: def.id,
    type: def.type,
    title: def.title,
    order: 0,
    config: { ...(def.config ?? {}) },
  }
}

/**
 * Hide keeps the widget in the saved list so GET-merge will not re-append it.
 * Show restores a catalog definition if it was somehow missing.
 */
export function toggleWidget(
  widgets: DashboardWidget[],
  def: WidgetDefinition,
  show: boolean,
  view: ViewMode,
): DashboardWidget[] {
  const existing = widgets.find((w) => w.id === def.id)
  if (existing) {
    if (!show) return readingOrder(widgets.map((w) => (w.id === def.id ? setHidden(w, true) : w)))
    const withoutRect = widgets.map((w) =>
      w.id === def.id
        ? { ...w, config: stripLayout(w.config) }
        : w,
    )
    return ensureLayout(withoutRect, view)
  }
  if (!show) return widgets
  const added = setHidden(newWidgetFromDefinition(def), false)
  return ensureLayout([...widgets, added], view)
}

export function resetLayout(
  view: ViewMode,
  presetId?: string | null,
): DashboardWidget[] {
  return ensureLayout(widgetsForTheme(view, presetId), view)
}
