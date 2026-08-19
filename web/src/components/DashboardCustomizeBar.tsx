import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { catalogForView, type WidgetDefinition } from '../dashboard/catalog'
import { isHidden } from '../dashboard/grid'
import type {
  DashboardLayoutPreset,
  DashboardWidget,
  ViewMode,
} from '../types/api'

export function DashboardCustomizeBar({
  view,
  customizing,
  onCustomizingChange,
  widgets,
  presets,
  activePresetId,
  onToggleWidget,
  onResetLayout,
  onSelectPreset,
  onSaveAs,
  onRename,
  onDelete,
}: {
  view: ViewMode
  customizing: boolean
  onCustomizingChange: (value: boolean) => void
  widgets: DashboardWidget[]
  presets: DashboardLayoutPreset[]
  activePresetId: string | null
  onToggleWidget: (def: WidgetDefinition, show: boolean) => void
  onResetLayout: () => void
  onSelectPreset: (id: string) => void
  onSaveAs: (name: string) => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const catalog = catalogForView(view)
  const [widgetsOpen, setWidgetsOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [mode, setMode] = useState<'save' | 'rename' | null>(null)
  const widgetsRef = useRef<HTMLDivElement>(null)
  const viewsRef = useRef<HTMLDivElement>(null)
  const widgetsMenuId = useId()
  const viewsMenuId = useId()

  const active = presets.find((p) => p.id === activePresetId)
  const visibleCount = widgets.filter((w) => !isHidden(w)).length

  useEffect(() => {
    if (!customizing) {
      setWidgetsOpen(false)
      setViewsOpen(false)
      setMode(null)
    }
  }, [customizing])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (widgetsOpen && widgetsRef.current && !widgetsRef.current.contains(target)) {
        setWidgetsOpen(false)
      }
      if (viewsOpen && viewsRef.current && !viewsRef.current.contains(target)) {
        setViewsOpen(false)
        setMode(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [widgetsOpen, viewsOpen])

  function submitName(event: FormEvent) {
    event.preventDefault()
    const name = nameDraft.trim()
    if (!name) return
    if (mode === 'rename') onRename(name)
    else onSaveAs(name)
    setNameDraft('')
    setMode(null)
  }

  return (
    <div className="dashboard-customize">
      <button
        type="button"
        className={customizing ? 'btn tiny' : 'btn ghost tiny'}
        aria-pressed={customizing}
        onClick={() => onCustomizingChange(!customizing)}
      >
        {customizing ? 'Done' : 'Customize layout'}
      </button>

      {customizing && (
        <>
          <div className="dashboard-menu" ref={widgetsRef}>
            <button
              type="button"
              className="btn ghost tiny"
              aria-expanded={widgetsOpen}
              aria-controls={widgetsMenuId}
              onClick={() => {
                setWidgetsOpen((o) => !o)
                setViewsOpen(false)
              }}
            >
              Widgets ({visibleCount}/{catalog.length})
            </button>
            {widgetsOpen && (
              <div id={widgetsMenuId} className="dashboard-menu-panel" role="menu">
                <p className="muted compact">Add or remove widgets on this view.</p>
                <ul className="dashboard-widget-list">
                  {catalog.map((def) => {
                    const row = widgets.find((w) => w.id === def.id)
                    const checked = Boolean(row && !isHidden(row))
                    return (
                      <li key={def.id}>
                        <label className="dashboard-widget-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => onToggleWidget(def, e.target.checked)}
                          />
                          <span>
                            <strong>{def.title}</strong>
                            <span className="muted compact">{def.description}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                <button
                  type="button"
                  className="btn ghost tiny"
                  onClick={onResetLayout}
                >
                  Reset to default layout
                </button>
              </div>
            )}
          </div>

          <div className="dashboard-menu" ref={viewsRef}>
            <button
              type="button"
              className="btn ghost tiny"
              aria-expanded={viewsOpen}
              aria-controls={viewsMenuId}
              onClick={() => {
                setViewsOpen((o) => !o)
                setWidgetsOpen(false)
              }}
            >
              Views{active ? `: ${active.name}` : ''}
            </button>
            {viewsOpen && (
              <div id={viewsMenuId} className="dashboard-menu-panel" role="menu">
                <p className="muted compact">
                  Save different pages and switch between them.
                </p>
                {presets.length === 0 ? (
                  <p className="muted compact">
                    No saved views yet. Arrange widgets, then save as a view.
                  </p>
                ) : (
                  <ul className="dashboard-view-list">
                    {presets.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={
                            p.id === activePresetId
                              ? 'dashboard-view-item active'
                              : 'dashboard-view-item'
                          }
                          onClick={() => onSelectPreset(p.id)}
                        >
                          {p.name}
                          <span className="muted compact">
                            {p.widgets.filter((w) => !isHidden(w)).length} widgets
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {mode ? (
                  <form className="dashboard-name-form" onSubmit={submitName}>
                    <label>
                      {mode === 'rename' ? 'Rename view' : 'Name this view'}
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        autoFocus
                        maxLength={80}
                        placeholder={mode === 'rename' ? active?.name : 'Spending focus'}
                      />
                    </label>
                    <div className="dashboard-name-actions">
                      <button type="submit" className="btn tiny primary">
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => setMode(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="dashboard-view-actions">
                    <button
                      type="button"
                      className="btn tiny"
                      onClick={() => {
                        setMode('save')
                        setNameDraft('')
                      }}
                    >
                      Save as view
                    </button>
                    {active && (
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => {
                          setMode('rename')
                          setNameDraft(active.name)
                        }}
                      >
                        Rename
                      </button>
                    )}
                    {active && presets.length > 1 && (
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={onDelete}
                      >
                        Delete view
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="muted compact dashboard-customize-hint">
            Drag the handle to move widgets side by side. Drag the corner to
            resize. Hidden widgets stay off this view until you add them back.
          </p>
        </>
      )}
      {!customizing && active && (
        <p className="muted compact dashboard-view-chip">View: {active.name}</p>
      )}
      {!customizing && visibleCount === 0 && (
        <p className="muted compact">No widgets on this view.</p>
      )}
    </div>
  )
}
