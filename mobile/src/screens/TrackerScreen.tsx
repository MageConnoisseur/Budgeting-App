import { useCallback, useEffect, useMemo, useState } from 'react'
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
import * as txApi from '../api/transactions'
import { CategoryPicker } from '../components/CategoryPicker'
import { NoteField } from '../components/NoteField'
import { useAuth } from '../context/AuthContext'
import {
  formatShortDate,
  formatUsd,
  isToday,
  shiftDate,
  todayISO,
  toMoneyString,
} from '../lib/format'
import { colors, radius } from '../theme'
import type { Category, NoteSuggestion, Transaction } from '../types'

const PAGE_SIZE = 40

export function TrackerScreen() {
  const { user, logout } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')

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

  const expenseCats = useMemo(
    () => {
      const active = categories.filter((c) => c.kind === 'expense' && !c.archived)
      if (formCategory && !active.some((c) => c.id === formCategory)) {
        const current = categories.find((c) => c.id === formCategory)
        if (current && current.kind === 'expense') return [current, ...active]
      }
      return active
    },
    [categories, formCategory],
  )

  const loadCategories = useCallback(async () => {
    const list = await categoriesApi.listCategories({ include_archived: true })
    setCategories(list)
  }, [])

  const loadTransactions = useCallback(async () => {
    const list = await txApi.listTransactions({
      q: search || undefined,
      kind: 'expense',
      sort_by: 'date',
      sort_dir: 'desc',
      limit: PAGE_SIZE,
      offset: 0,
    })
    setItems(list.items)
    setTotal(list.total)
  }, [search])

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      await Promise.all([loadCategories(), loadTransactions()])
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Could not load expenses')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loadCategories, loadTransactions])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

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
    if (expenseCats.length && !expenseCats.some((c) => c.id === formCategory)) {
      setFormCategory(expenseCats[0].id)
    }
  }, [expenseCats, formCategory])

  useEffect(() => {
    if (!formCategory || !formDate) {
      setPlanFunding(null)
      return
    }
    const match = /^(\d{4})-(\d{2})/.exec(formDate)
    if (!match) {
      setPlanFunding(null)
      return
    }
    let cancelled = false
    void budgetsApi
      .getExpenseFunding(Number(match[1]), Number(match[2]), formCategory)
      .then((row) => {
        if (cancelled) return
        if (row.funded_by_category_id && row.funded_by_category_name) {
          setPlanFunding({
            id: row.funded_by_category_id,
            name: row.funded_by_category_name,
          })
          setWithdrawFromBucket(true)
        } else {
          setPlanFunding(null)
        }
      })
      .catch(() => {
        if (!cancelled) setPlanFunding(null)
      })
    return () => {
      cancelled = true
    }
  }, [formCategory, formDate])

  function resetForm() {
    setEditingId(null)
    setFormAmount('')
    setFormNote('')
    setFormDate(todayISO())
    if (expenseCats[0] && !expenseCats.some((c) => c.id === formCategory)) {
      setFormCategory(expenseCats[0].id)
    }
  }

  function startEdit(tx: Transaction) {
    setEditingId(tx.id)
    setFormCategory(tx.category_id)
    setFormAmount(tx.amount)
    setFormDate(tx.date)
    setFormNote(tx.note ?? '')
    setError(null)
    setBanner(null)
  }

  function onNotePick(suggestion: NoteSuggestion) {
    if (suggestion.last_kind === 'expense' && suggestion.last_category_id) {
      setFormCategory(suggestion.last_category_id)
    }
    if (!formAmount) setFormAmount(suggestion.last_amount)
  }

  async function onSubmit() {
    if (!formCategory) {
      setError('Select a category. Create expense categories on the website first.')
      return
    }
    const amount = toMoneyString(formAmount)
    if (!formAmount.trim() || Number(amount) <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        category_id: formCategory,
        amount,
        date: formDate,
        note: formNote.trim() || null,
        ...(!editingId && withdrawFromBucket && planFunding
          ? { withdraw_from_category_id: planFunding.id }
          : {}),
      }
      const catName =
        categories.find((c) => c.id === formCategory)?.name ?? 'expense'
      if (editingId) {
        await txApi.updateTransaction(editingId, payload)
        setBanner(`Updated ${formatUsd(amount)} · ${catName}`)
      } else {
        await txApi.createTransaction(payload)
        setBanner(`Logged ${formatUsd(amount)} · ${catName}`)
      }
      resetForm()
      await loadTransactions()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : editingId
            ? 'Could not update expense'
            : 'Could not log expense',
      )
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(tx: Transaction) {
    const name = tx.category?.name ?? 'this expense'
    Alert.alert('Delete expense?', `${formatUsd(tx.amount)} · ${name}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await txApi.deleteTransaction(tx.id)
              if (editingId === tx.id) resetForm()
              await loadTransactions()
            } catch (err) {
              setError(err instanceof ApiError ? err.detail : 'Delete failed')
            }
          })()
        },
      },
    ])
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>Setaside</Text>
          <Text style={styles.hello}>Hi {user?.username}</Text>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {editingId ? 'Edit expense' : 'Log an expense'}
        </Text>

        <Text style={styles.label}>Amount</Text>
        <TextInput
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
          categories={expenseCats}
          value={formCategory}
          onChange={setFormCategory}
        />

        {expenseCats.length === 0 ? (
          <Text style={styles.warn}>
            No expense categories yet. Add them on the website, then pull to
            refresh.
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

        {planFunding && !editingId ? (
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

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {banner ? <Text style={styles.success}>{banner}</Text> : null}

        <Pressable
          onPress={() => void onSubmit()}
          disabled={saving || expenseCats.length === 0}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            (saving || expenseCats.length === 0) && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={editingId ? 'Save changes' : 'Log expense'}
        >
          <Text style={styles.buttonText}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Log expense'}
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
        Recent expenses{total ? ` · ${total}` : ''}
      </Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search notes, categories, amounts"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search expenses"
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
            data={items}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void loadAll()
                }}
                tintColor={colors.pine}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search
                  ? 'No expenses match that search.'
                  : 'Nothing logged yet. Add one above.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => startEdit(item)}
                onLongPress={() => confirmDelete(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${item.category?.name ?? 'Expense'}, ${formatUsd(item.amount)}`}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowCat}>
                    {item.category?.name ?? 'Expense'}
                  </Text>
                  <Text style={styles.rowNote} numberOfLines={1}>
                    {item.note || formatShortDate(item.date)}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowAmt}>{formatUsd(item.amount)}</Text>
                  <Pressable
                    onPress={() => confirmDelete(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete expense"
                  >
                    <Text style={styles.delete}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            )}
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
    color: colors.expense,
    fontSize: 16,
    fontWeight: '700',
  },
  delete: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
})
