import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as budgetsApi from '../api/budgets'
import * as categoriesApi from '../api/categories'
import { ApiError } from '../api/client'
import * as glanceApi from '../api/glance'
import * as txApi from '../api/transactions'
import { CategoryPicker } from '../components/CategoryPicker'
import { LeftoverGlance } from '../components/LeftoverGlance'
import { NoteField } from '../components/NoteField'
import { useAuth } from '../context/AuthContext'
import {
  formatShortDate,
  formatUsd,
  isToday,
  shiftDate,
  todayISO,
  toMoneyString,
  yearMonthFromISO,
} from '../lib/format'
import { colors, radius } from '../theme'
import { enqueueLog } from '../upload/enqueueLog'
import {
  readCategoryCache,
  readFundingEntry,
  readOutbox,
  removeQueued,
  writeCategoryCache,
  writeFundingEntry,
} from '../upload/native'
import type { OutboxItem } from '../upload/outbox'
import type { LogLaunch } from '../useLogLaunch'
import type {
  Category,
  CategoryKind,
  MobileGlance,
  NoteSuggestion,
  Transaction,
} from '../types'

type ListRow =
  | { key: string; source: 'local'; item: OutboxItem }
  | { key: string; source: 'server'; item: Transaction }

const PAGE_SIZE = 40
const KINDS: CategoryKind[] = ['income', 'expense', 'savings']
const KIND_TITLE: Record<CategoryKind, string> = {
  income: 'Income',
  expense: 'Expense',
  savings: 'Savings',
}

function kindNoun(kind: CategoryKind): string {
  return kind
}

function logCardTitle(kind: CategoryKind, editing: boolean): string {
  if (editing) return `Edit ${kindNoun(kind)}`
  if (kind === 'expense') return 'Log an expense'
  return `Log ${kindNoun(kind)}`
}

function logButtonLabel(kind: CategoryKind, editing: boolean): string {
  if (editing) return 'Save changes'
  return `Log ${kindNoun(kind)}`
}

export function TrackerScreen({ launch }: { launch: LogLaunch | null }) {
  const { user, logout } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Transaction[]>([])
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sheetToken, setSheetToken] = useState(0)
  const amountRef = useRef<TextInput>(null)
  const outboxRef = useRef(outbox)
  outboxRef.current = outbox
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')

  const [formKind, setFormKind] = useState<CategoryKind>('expense')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCategory, setFormCategory] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(todayISO())
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [planFunding, setPlanFunding] = useState<{
    id: string
    name: string
  } | null>(null)
  const [withdrawFromBucket, setWithdrawFromBucket] = useState(true)
  const [glance, setGlance] = useState<MobileGlance | null>(null)
  const [glanceError, setGlanceError] = useState<string | null>(null)

  const kindCats = useMemo(() => {
    const active = categories.filter((c) => c.kind === formKind && !c.archived)
    if (formCategory && !active.some((c) => c.id === formCategory)) {
      const current = categories.find((c) => c.id === formCategory)
      if (current && current.kind === formKind) return [current, ...active]
    }
    return active
  }, [categories, formCategory, formKind])

  const loadCategories = useCallback(async () => {
    try {
      const list = await categoriesApi.listCategories({ include_archived: true })
      setCategories(list)
      await writeCategoryCache(list)
    } catch (err) {
      if (categoriesRef.current.length === 0) {
        setError(err instanceof ApiError ? err.detail : 'Could not load categories')
      }
    }
  }, [])

  const loadTransactions = useCallback(async () => {
    try {
      const list = await txApi.listTransactions({
        q: search || undefined,
        kind: formKind,
        sort_by: 'date',
        sort_dir: 'desc',
        limit: PAGE_SIZE,
        offset: 0,
      })
      setItems(list.items)
      setTotal(list.total)
    } catch {
      // The form stays usable while the API wakes up. Pull to refresh retries.
    }
  }, [search, formKind])

  const loadGlance = useCallback(async () => {
    const ym = yearMonthFromISO(formDate)
    if (!ym) return
    try {
      const data = await glanceApi.getGlance(ym.year, ym.month)
      setGlance(data)
      setGlanceError(null)
    } catch (err) {
      setGlanceError(
        err instanceof ApiError ? err.detail : 'Could not load leftover',
      )
    }
  }, [formDate])

  const refreshQueue = useCallback(async () => {
    const next = await readOutbox()
    const nextIds = new Set(next.map((item) => item.id))
    const removed = outboxRef.current.filter(
      (item) => item.status === 'pending' && !nextIds.has(item.id),
    )
    setOutbox(next)
    if (removed.length) void loadTransactions()
  }, [loadTransactions])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [cached, queued] = await Promise.all([
        readCategoryCache(),
        readOutbox(),
      ])
      if (cancelled) return
      if (cached) setCategories(cached)
      setOutbox(queued)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (loading) return
    void loadCategories()
  }, [loading, loadCategories])

  useEffect(() => {
    if (loading) return
    void loadTransactions()
  }, [loading, loadTransactions])

  useEffect(() => {
    void loadGlance()
  }, [loadGlance])

  useEffect(() => {
    const handle = setTimeout(() => setSearch(q.trim()), 250)
    return () => clearTimeout(handle)
  }, [q])

  useEffect(() => {
    if (!banner) return
    const handle = setTimeout(() => setBanner(null), 3500)
    return () => clearTimeout(handle)
  }, [banner])

  useEffect(() => {
    if (kindCats.length && !kindCats.some((c) => c.id === formCategory)) {
      setFormCategory(kindCats[0].id)
    }
    if (!kindCats.length) setFormCategory('')
  }, [kindCats, formCategory])

  useEffect(() => {
    if (!launch) return
    setFormKind(launch.kind)
    setEditingId(null)
    setFormAmount('')
    setFormNote('')
    setFormDate(todayISO())
    setError(null)
    setPlanFunding(null)
    setSheetToken(launch.seq)
  }, [launch])

  useEffect(() => {
    if (formKind !== 'expense' || !formCategory || !formDate) {
      setPlanFunding(null)
      return
    }
    const match = /^(\d{4})-(\d{2})/.exec(formDate)
    if (!match) {
      setPlanFunding(null)
      return
    }
    const year = Number(match[1])
    const month = Number(match[2])
    let cancelled = false
    void readFundingEntry(year, month, formCategory).then((cached) => {
      if (cancelled || cached === undefined) return
      setPlanFunding(cached)
      if (cached) setWithdrawFromBucket(true)
    })
    void budgetsApi
      .getExpenseFunding(year, month, formCategory)
      .then((row) => {
        if (cancelled) return
        if (row.funded_by_category_id && row.funded_by_category_name) {
          const next = {
            id: row.funded_by_category_id,
            name: row.funded_by_category_name,
          }
          setPlanFunding(next)
          setWithdrawFromBucket(true)
          void writeFundingEntry(year, month, formCategory, next)
        } else {
          setPlanFunding(null)
          void writeFundingEntry(year, month, formCategory, null)
        }
      })
      .catch(() => {
        // Keep the cached paid-from choice when the API is still waking up.
      })
    return () => {
      cancelled = true
    }
  }, [formKind, formCategory, formDate])

  function chooseKind(next: CategoryKind) {
    if (next === formKind) return
    setFormKind(next)
    setPlanFunding(null)
    setError(null)
  }

  function resetForm() {
    setEditingId(null)
    setFormAmount('')
    setFormNote('')
    setFormDate(todayISO())
    if (kindCats[0] && !kindCats.some((c) => c.id === formCategory)) {
      setFormCategory(kindCats[0].id)
    }
  }

  function startEdit(tx: Transaction) {
    const kind = tx.category?.kind ?? formKind
    setFormKind(kind)
    setEditingId(tx.id)
    setFormCategory(tx.category_id)
    setFormAmount(tx.amount)
    setFormDate(tx.date)
    setFormNote(tx.note ?? '')
    setError(null)
    setBanner(null)
  }

  function onNotePick(suggestion: NoteSuggestion) {
    if (suggestion.last_kind === formKind && suggestion.last_category_id) {
      setFormCategory(suggestion.last_category_id)
    }
    if (!formAmount) setFormAmount(suggestion.last_amount)
  }

  async function onSubmit() {
    if (!formCategory) {
      setError(
        `Select a category. Create ${kindNoun(formKind)} categories on the website first.`,
      )
      return
    }
    const amount = toMoneyString(formAmount)
    if (!formAmount.trim() || Number(amount) <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setSaving(true)
    setError(null)
    const catName =
      categories.find((c) => c.id === formCategory)?.name ?? kindNoun(formKind)
    const payload = {
      category_id: formCategory,
      amount,
      date: formDate,
      note: formNote.trim() || null,
      ...(formKind === 'expense' && withdrawFromBucket && planFunding
        ? { withdraw_from_category_id: planFunding.id }
        : {}),
    }
    try {
      if (editingId) {
        await txApi.updateTransaction(editingId, payload)
        setBanner(`Updated ${formatUsd(amount)} · ${catName}`)
        resetForm()
        await Promise.all([loadTransactions(), loadGlance()])
      } else {
        const queued = await enqueueLog({
          kind: formKind,
          categoryId: formCategory,
          categoryName: catName,
          amount,
          date: formDate,
          note: formNote.trim() || null,
          withdrawFromCategoryId:
            formKind === 'expense' && withdrawFromBucket && planFunding
              ? planFunding.id
              : null,
        })
        if (queued.mode === 'queued') {
          setOutbox(queued.items)
          setBanner(`Saved ${formatUsd(amount)} · ${catName}. Uploading…`)
        } else {
          setBanner(`Logged ${formatUsd(amount)} · ${catName}`)
          void Promise.all([loadTransactions(), loadGlance()])
        }
        resetForm()
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : editingId
              ? `Could not update ${kindNoun(formKind)}`
              : `Could not log ${kindNoun(formKind)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  const mine = useMemo(
    () => outbox.filter((item) => !user?.id || item.owner_id === user.id),
    [outbox, user?.id],
  )
  const hasPending = mine.some((item) => item.status === 'pending')
  useEffect(() => {
    if (!hasPending) return
    const handle = setInterval(() => {
      void refreshQueue()
    }, 2000)
    return () => clearInterval(handle)
  }, [hasPending, refreshQueue])

  const needsAuth = mine.some(
    (item) => item.kind === formKind && item.status === 'needs_auth',
  )

  const rows = useMemo<ListRow[]>(() => {
    const query = search.trim().toLowerCase()
    const local = mine
      .filter((item) => {
        if (item.kind !== formKind) return false
        if (!query) return true
        const hay = `${item.category_name} ${item.note ?? ''} ${item.amount}`.toLowerCase()
        return hay.includes(query)
      })
      .map((item) => ({ key: `local-${item.id}`, source: 'local' as const, item }))
    const server = items.map((item) => ({
      key: item.id,
      source: 'server' as const,
      item,
    }))
    return [...local, ...server]
  }, [mine, items, formKind, search])

  async function removeLocal(id: string) {
    setOutbox(await removeQueued(id))
  }

  async function doDelete(tx: Transaction) {
    try {
      await txApi.deleteTransaction(tx.id)
      if (editingId === tx.id) resetForm()
      await Promise.all([loadTransactions(), loadGlance()])
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Delete failed')
    }
  }

  function confirmDelete(tx: Transaction) {
    const name = tx.category?.name ?? `this ${kindNoun(formKind)}`
    const message = `${formatUsd(tx.amount)} · ${name}`
    if (Platform.OS === 'web') {
      const ok =
        typeof globalThis.confirm === 'function' &&
        globalThis.confirm(`Delete ${kindNoun(formKind)}?\n${message}`)
      if (ok) void doDelete(tx)
      return
    }
    Alert.alert(`Delete ${kindNoun(formKind)}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void doDelete(tx)
        },
      },
    ])
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>Setaside</Text>
          <Text style={styles.hello}>Hi {user?.username ?? 'there'}</Text>
        </View>
        <Pressable
          onPress={() => void logout()}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={8}
        >
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      <LeftoverGlance data={glance} error={glanceError} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {logCardTitle(formKind, Boolean(editingId))}
        </Text>

        <View
          style={styles.kindRow}
          accessibilityRole="tablist"
          accessibilityLabel="Transaction kind"
        >
          {KINDS.map((kind) => {
            const on = kind === formKind
            return (
              <Pressable
                key={kind}
                onPress={() => chooseKind(kind)}
                style={[styles.kindPill, on && styles.kindPillOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={KIND_TITLE[kind]}
              >
                <Text style={[styles.kindPillText, on && styles.kindPillTextOn]}>
                  {KIND_TITLE[kind]}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={styles.label}>Amount</Text>
        <TextInput
          ref={amountRef}
          value={formAmount}
          onChangeText={setFormAmount}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.00"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Amount"
          style={styles.amount}
        />

        <CategoryPicker
          categories={kindCats}
          value={formCategory}
          onChange={(id) => {
            setFormCategory(id)
            setTimeout(() => amountRef.current?.focus(), 300)
          }}
          kindLabel={KIND_TITLE[formKind]}
          openToken={loading ? 0 : sheetToken}
        />

        {kindCats.length === 0 ? (
          <Text style={styles.warn}>
            No {kindNoun(formKind)} categories yet. Add them on the website,
            then pull to refresh.
          </Text>
        ) : null}

        <Text style={[styles.label, styles.dateLabel]}>Date</Text>
        <View style={styles.dateRow}>
          <Pressable
            onPress={() => setFormDate((d) => shiftDate(d, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            style={styles.dateBtn}
          >
            <Text style={styles.dateBtnText}>‹</Text>
          </Pressable>
          <View style={styles.dateMid}>
            <Text style={styles.dateText}>{formatShortDate(formDate)}</Text>
            {!isToday(formDate) ? (
              <Pressable onPress={() => setFormDate(todayISO())}>
                <Text style={styles.link}>Today</Text>
              </Pressable>
            ) : (
              <Text style={styles.todayTag}>Today</Text>
            )}
          </View>
          <Pressable
            onPress={() => setFormDate((d) => shiftDate(d, 1))}
            accessibilityRole="button"
            accessibilityLabel="Next day"
            style={styles.dateBtn}
          >
            <Text style={styles.dateBtnText}>›</Text>
          </Pressable>
        </View>

        <NoteField
          value={formNote}
          categoryId={formCategory || undefined}
          onChange={setFormNote}
          onPick={onNotePick}
        />

        {formKind === 'expense' && planFunding && !editingId ? (
          <Pressable
            onPress={() => setWithdrawFromBucket((v) => !v)}
            style={styles.checkRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: withdrawFromBucket }}
          >
            <View
              style={[styles.checkbox, withdrawFromBucket && styles.checkboxOn]}
            >
              {withdrawFromBucket ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>
              Also withdraw from {planFunding.name}
            </Text>
          </Pressable>
        ) : null}

        {needsAuth ? (
          <View>
            <Text style={styles.error}>
              Saved entries are waiting. Sign in again to send them.
            </Text>
            <Pressable
              onPress={() => void logout()}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.link}>Sign in</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {banner ? <Text style={styles.success}>{banner}</Text> : null}

        <Pressable
          onPress={() => void onSubmit()}
          disabled={saving || kindCats.length === 0}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            (saving || kindCats.length === 0) && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={logButtonLabel(formKind, Boolean(editingId))}
        >
          <Text style={styles.buttonText}>
            {saving
              ? 'Saving…'
              : logButtonLabel(formKind, Boolean(editingId))}
          </Text>
        </Pressable>
        {editingId ? (
          <Pressable
            onPress={resetForm}
            disabled={saving}
            style={styles.cancel}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Cancel edit</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.section}>
        Recent {kindNoun(formKind)}
        {total ? ` · ${total}` : ''}
      </Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search notes, categories, amounts"
        placeholderTextColor={colors.muted}
        accessibilityLabel={`Search ${kindNoun(formKind)}`}
        style={styles.search}
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.pine} />
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void Promise.all([
                    loadCategories(),
                    loadTransactions(),
                    loadGlance(),
                    refreshQueue(),
                  ]).finally(() => setRefreshing(false))
                }}
                tintColor={colors.pine}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search
                  ? `No ${kindNoun(formKind)} matches that search.`
                  : 'Nothing logged yet. Add one above.'}
              </Text>
            }
            renderItem={({ item: row }) => {
              if (row.source === 'local') {
                const item = row.item
                const status =
                  item.status === 'pending'
                    ? 'Uploading…'
                    : item.status === 'needs_auth'
                      ? 'Sign in to send'
                      : item.detail || 'Could not upload'
                return (
                  <View style={styles.row}>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowCat}>{item.category_name}</Text>
                      <Text style={styles.rowNote} numberOfLines={1}>
                        {status}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={[styles.rowAmt, { color: colors[item.kind] }]}>
                        {formatUsd(item.amount)}
                      </Text>
                      <Pressable
                        onPress={() => {
                          Alert.alert('Remove saved entry?', status, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                void removeLocal(item.id)
                              },
                            },
                          ])
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Delete"
                      >
                        <Text style={styles.delete}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                )
              }
              const item = row.item
              const kind = item.category?.kind ?? formKind
              return (
                <View style={styles.row}>
                  <Pressable
                    onPress={() => startEdit(item)}
                    style={({ pressed }) => [
                      styles.rowMain,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.category?.name ?? KIND_TITLE[kind]}, ${formatUsd(item.amount)}, edit`}
                  >
                    <Text style={styles.rowCat}>
                      {item.category?.name ?? KIND_TITLE[kind]}
                    </Text>
                    <Text style={styles.rowNote} numberOfLines={1}>
                      {item.note || formatShortDate(item.date)}
                    </Text>
                  </Pressable>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowAmt, { color: colors[kind] }]}>
                      {formatUsd(item.amount)}
                    </Text>
                    <Pressable
                      onPress={() => confirmDelete(item)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Delete"
                    >
                      <Text style={styles.delete}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              )
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  headerBlock: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  brand: {
    color: colors.pine,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hello: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  link: {
    color: colors.pine,
    fontSize: 15,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    marginBottom: 22,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kindPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  kindPillOn: {
    backgroundColor: colors.pine,
    borderColor: colors.pine,
  },
  kindPillText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  kindPillTextOn: {
    color: colors.white,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  amount: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 56,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 28,
    fontWeight: '700',
  },
  dateLabel: {
    marginTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtnText: {
    fontSize: 24,
    color: colors.pine,
    lineHeight: 26,
  },
  dateMid: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  dateText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  todayTag: {
    color: colors.muted,
    fontSize: 12,
  },
  warn: {
    color: colors.warn,
    backgroundColor: colors.warnBg,
    padding: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  error: {
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  success: {
    color: colors.success,
    backgroundColor: colors.successBg,
    padding: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.pine,
  },
  checkMark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    color: colors.ink,
    fontSize: 14,
    flex: 1,
  },
  button: {
    backgroundColor: colors.pine,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.55,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  section: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  search: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    marginBottom: 8,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  row: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowMain: {
    flex: 1,
  },
  rowCat: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  rowNote: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowAmt: {
    fontSize: 16,
    fontWeight: '700',
  },
  delete: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
})
