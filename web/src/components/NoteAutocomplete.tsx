import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import * as txApi from '../api/transactions'
import { formatUsd } from '../lib/format'
import type { NoteSuggestion } from '../types/api'

interface Props {
  value: string
  onChange: (value: string) => void
  categoryId?: string
  maxLength?: number
  placeholder?: string
  /** Called when the user picks a suggestion (note already applied via onChange). */
  onPick?: (suggestion: NoteSuggestion) => void
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function NoteAutocomplete({
  value,
  onChange,
  categoryId,
  maxLength = 2000,
  placeholder = 'Optional — e.g. Trader Joe’s, rent',
  onPick,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NoteSuggestion[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const skipFetch = useRef(false)

  useEffect(() => {
    if (skipFetch.current) {
      skipFetch.current = false
      return
    }
    if (!open) return

    const handle = window.setTimeout(() => {
      setLoading(true)
      void txApi
        .suggestNotes({
          q: value.trim() || undefined,
          category_id: categoryId || undefined,
          limit: 8,
        })
        .then((res) => {
          setItems(res.items)
          setActive(0)
        })
        .catch(() => {
          setItems([])
        })
        .finally(() => setLoading(false))
    }, 200)

    return () => window.clearTimeout(handle)
  }, [value, categoryId, open])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function applySuggestion(item: NoteSuggestion) {
    skipFetch.current = true
    onChange(item.note)
    setItems([])
    setOpen(false)
    onPick?.(item)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === 'ArrowDown') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      applySuggestion(items[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const showList = open && (loading || items.length > 0)

  return (
    <div className="note-autocomplete" ref={wrapRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && items[active] ? `${listId}-${active}` : undefined
        }
      />
      {showList && (
        <ul
          id={listId}
          className="note-suggest-list"
          role="listbox"
          aria-label="Past notes"
        >
          {loading && items.length === 0 ? (
            <li className="note-suggest-empty" role="presentation">
              Looking up past notes…
            </li>
          ) : (
            items.map((item, index) => (
              <li
                key={`${item.note}-${item.last_category_id}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={
                  index === active
                    ? 'note-suggest-item is-active'
                    : 'note-suggest-item'
                }
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applySuggestion(item)
                }}
              >
                <span className="note-suggest-main">
                  <span className="note-suggest-text">{item.note}</span>
                  {item.use_count > 1 && (
                    <span className="note-suggest-count">
                      ×{item.use_count}
                    </span>
                  )}
                </span>
                <span className="note-suggest-meta">
                  Last {formatShortDate(item.last_date)} ·{' '}
                  {formatUsd(item.last_amount)} · {item.last_category_name}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
