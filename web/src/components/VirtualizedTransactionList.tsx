import { useMemo, useRef, useState } from 'react'
import { KindBadge } from './KindBadge'
import { formatUsd } from '../lib/format'
import { virtualWindow } from '../lib/virtualWindow'
import type { Transaction, TransactionSortBy } from '../types/api'

const ROW_HEIGHT = 48
const VIEWPORT_MAX = 560

interface Props {
  items: Transaction[]
  total: number
  offset: number
  pageSize: number
  sortBy: TransactionSortBy
  sortDir: 'asc' | 'desc'
  editingId: string | null
  onToggleSort: (col: TransactionSortBy) => void
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
  onPrev: () => void
  onNext: () => void
}

function sortMark(
  active: TransactionSortBy,
  col: TransactionSortBy,
  dir: 'asc' | 'desc',
) {
  if (active !== col) return ''
  return dir === 'asc' ? '↑' : '↓'
}

export function VirtualizedTransactionList({
  items,
  total,
  offset,
  pageSize,
  sortBy,
  sortDir,
  editingId,
  onToggleSort,
  onEdit,
  onDelete,
  onPrev,
  onNext,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const viewportHeight = Math.min(
    VIEWPORT_MAX,
    Math.max(ROW_HEIGHT * 8, items.length * ROW_HEIGHT),
  )

  const win = useMemo(
    () =>
      virtualWindow({
        scrollTop,
        viewportHeight,
        rowCount: items.length,
        rowHeight: ROW_HEIGHT,
      }),
    [scrollTop, viewportHeight, items.length],
  )

  const slice = items.slice(win.start, win.end)

  return (
    <>
      <div className="virtual-table-wrap">
        <div
          className="virtual-table"
          role="table"
          aria-label="Transactions"
          aria-rowcount={items.length}
        >
          <div className="virtual-table-head" role="rowgroup">
            <div className="virtual-table-row head" role="row">
              <div role="columnheader">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => onToggleSort('date')}
                >
                  Date {sortMark(sortBy, 'date', sortDir)}
                </button>
              </div>
              <div role="columnheader">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => onToggleSort('kind')}
                >
                  Kind {sortMark(sortBy, 'kind', sortDir)}
                </button>
              </div>
              <div role="columnheader">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => onToggleSort('category')}
                >
                  Category {sortMark(sortBy, 'category', sortDir)}
                </button>
              </div>
              <div role="columnheader">
                <button
                  type="button"
                  className="th-btn"
                  onClick={() => onToggleSort('amount')}
                >
                  Amount {sortMark(sortBy, 'amount', sortDir)}
                </button>
              </div>
              <div role="columnheader">Note</div>
              <div role="columnheader" className="actions-head">
                <span className="sr-only">Actions</span>
              </div>
            </div>
          </div>
          <div
            ref={scrollerRef}
            className="virtual-table-body"
            role="rowgroup"
            style={{ height: viewportHeight }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div
              className="virtual-table-spacer"
              style={{ height: win.totalHeight }}
            >
              <div
                className="virtual-table-window"
                style={{ transform: `translateY(${win.offsetY}px)` }}
              >
                {slice.map((tx) => (
                  <div
                    key={tx.id}
                    className={
                      editingId === tx.id
                        ? 'virtual-table-row row-editing'
                        : 'virtual-table-row'
                    }
                    role="row"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div role="cell">{tx.date}</div>
                    <div role="cell">
                      {tx.category ? (
                        <KindBadge kind={tx.category.kind} />
                      ) : (
                        '—'
                      )}
                    </div>
                    <div role="cell">
                      {tx.category?.name ?? '—'}
                      {tx.pair_id ? (
                        <span className="muted compact"> · from savings</span>
                      ) : null}
                    </div>
                    <div role="cell" className="num">
                      {formatUsd(tx.amount)}
                    </div>
                    <div role="cell" className="note-cell">
                      {tx.note || '—'}
                    </div>
                    <div role="cell" className="actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => onEdit(tx)}
                        disabled={editingId === tx.id}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => onDelete(tx.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <p className="muted">
          Showing {total === 0 ? 0 : offset + 1}–
          {Math.min(offset + pageSize, total)} of {total}
        </p>
        <div className="row-gap">
          <button
            type="button"
            className="btn ghost"
            disabled={offset === 0}
            onClick={onPrev}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={offset + pageSize >= total}
            onClick={onNext}
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}
