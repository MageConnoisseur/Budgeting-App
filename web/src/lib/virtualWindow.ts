/** Window math for virtualized lists (no React). */

export interface VirtualWindow {
  start: number
  end: number
  offsetY: number
  totalHeight: number
}

export function virtualWindow(args: {
  scrollTop: number
  viewportHeight: number
  rowCount: number
  rowHeight: number
  overscan?: number
}): VirtualWindow {
  const { scrollTop, viewportHeight, rowCount, rowHeight } = args
  const overscan = args.overscan ?? 6
  const height = Math.max(0, rowHeight)
  const totalHeight = Math.max(0, rowCount * height)
  if (rowCount === 0 || height === 0 || viewportHeight <= 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight }
  }

  const first = Math.floor(Math.max(0, scrollTop) / height)
  const visible = Math.ceil(viewportHeight / height)
  const start = Math.max(0, first - overscan)
  const end = Math.min(rowCount, first + visible + overscan)
  return {
    start,
    end,
    offsetY: start * height,
    totalHeight,
  }
}

export function nearListEnd(args: {
  scrollTop: number
  viewportHeight: number
  totalHeight: number
  thresholdPx?: number
}): boolean {
  const threshold = args.thresholdPx ?? 240
  return args.scrollTop + args.viewportHeight >= args.totalHeight - threshold
}
