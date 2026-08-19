import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  GRID_COLS,
  GRID_GAP_PX,
  GRID_ROW_PX,
  widgetLabel,
} from '../dashboard/catalog'
import {
  minSizeFor,
  moveWidget,
  pointToCell,
  visiblePlaced,
  type GridRect,
} from '../dashboard/grid'
import type { DashboardWidget } from '../types/api'

type DragKind = 'move' | 'resize'

type DragState = {
  kind: DragKind
  id: string
  startRect: GridRect
  pointerId: number
  originCell: { x: number; y: number }
}

function rectFromPointer(
  state: DragState,
  cell: { x: number; y: number },
): GridRect {
  if (state.kind === 'move') {
    return {
      ...state.startRect,
      x: state.startRect.x + (cell.x - state.originCell.x),
      y: state.startRect.y + (cell.y - state.originCell.y),
    }
  }
  const min = minSizeFor(state.id)
  return {
    ...state.startRect,
    w: Math.max(min.w, cell.x - state.startRect.x + 1),
    h: Math.max(min.h, cell.y - state.startRect.y + 1),
  }
}

export function DashboardGrid({
  widgets,
  customizing,
  onLayoutChange,
  onHide,
  renderItem,
}: {
  widgets: DashboardWidget[]
  customizing: boolean
  onLayoutChange: (next: DashboardWidget[]) => void
  onHide: (id: string) => void
  renderItem: (widget: DashboardWidget) => ReactNode
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const widgetsRef = useRef(widgets)
  useEffect(() => {
    widgetsRef.current = widgets
  }, [widgets])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [preview, setPreview] = useState<GridRect | null>(null)

  const items = visiblePlaced(widgets)
  const maxRow = items.reduce((m, w) => Math.max(m, w.rect.y + w.rect.h), 1)

  const applyFromPoint = useCallback(
    (state: DragState, clientX: number, clientY: number) => {
      const grid = gridRef.current?.getBoundingClientRect()
      if (!grid) return
      const cell = pointToCell(clientX, clientY, grid)
      setPreview(rectFromPointer(state, cell))
    },
    [],
  )

  const endDrag = useCallback(
    (state: DragState, clientX: number, clientY: number) => {
      const grid = gridRef.current?.getBoundingClientRect()
      setDrag(null)
      setPreview(null)
      if (!grid) return
      const cell = pointToCell(clientX, clientY, grid)
      const next = rectFromPointer(state, cell)
      if (
        next.x === state.startRect.x &&
        next.y === state.startRect.y &&
        next.w === state.startRect.w &&
        next.h === state.startRect.h
      ) {
        return
      }
      onLayoutChange(moveWidget(widgetsRef.current, state.id, next))
    },
    [onLayoutChange],
  )

  function startDrag(
    kind: DragKind,
    id: string,
    rect: GridRect,
    event: PointerEvent,
  ) {
    if (!customizing) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const grid = gridRef.current?.getBoundingClientRect()
    const originCell = grid
      ? pointToCell(event.clientX, event.clientY, grid)
      : { x: rect.x, y: rect.y }
    const state: DragState = {
      kind,
      id,
      startRect: rect,
      pointerId: event.pointerId,
      originCell,
    }
    setDrag(state)
    setPreview(rect)
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    applyFromPoint(drag, event.clientX, event.clientY)
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    endDrag(drag, event.clientX, event.clientY)
  }

  return (
    <div
      ref={gridRef}
      className={`dashboard-grid${customizing ? ' is-customizing' : ''}`}
      style={{ minHeight: maxRow * (GRID_ROW_PX + GRID_GAP_PX) }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {drag && preview && (
        <div
          className="dashboard-grid-ghost"
          style={{
            gridColumn: `${preview.x + 1} / span ${preview.w}`,
            gridRow: `${preview.y + 1} / span ${preview.h}`,
          }}
        />
      )}
      {items.map((w) => {
        const rect =
          drag && preview && drag.id === w.id ? drag.startRect : w.rect
        const dragging = drag?.id === w.id
        return (
          <article
            key={w.id}
            className={`dashboard-grid-item widget-shell${dragging ? ' is-dragging' : ''}`}
            style={{
              gridColumn: `${rect.x + 1} / span ${rect.w}`,
              gridRow: `${rect.y + 1} / span ${rect.h}`,
              opacity: dragging ? 0.55 : 1,
            }}
            data-widget-id={w.id}
          >
            {customizing && (
              <div className="widget-chrome">
                <button
                  type="button"
                  className="widget-drag-handle"
                  aria-label={`Move ${widgetLabel(w)}`}
                  title="Drag to move"
                  onPointerDown={(e) => startDrag('move', w.id, w.rect, e)}
                >
                  ⋮⋮
                </button>
                <span className="widget-chrome-title">{widgetLabel(w)}</span>
                <div className="widget-chrome-actions">
                  <span className="muted compact widget-size-label">
                    {w.rect.w}/{GRID_COLS} × {w.rect.h}
                  </span>
                  <button
                    type="button"
                    className="btn ghost tiny"
                    aria-label={`Hide ${widgetLabel(w)}`}
                    onClick={() => onHide(w.id)}
                  >
                    Hide
                  </button>
                </div>
                <button
                  type="button"
                  className="widget-resize-handle"
                  aria-label={`Resize ${widgetLabel(w)}`}
                  title="Drag to resize"
                  onPointerDown={(e) => startDrag('resize', w.id, w.rect, e)}
                />
              </div>
            )}
            <div className="widget-body">{renderItem(w)}</div>
          </article>
        )
      })}
    </div>
  )
}
