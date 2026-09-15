import { StyleSheet, Text, View } from 'react-native'
import { formatUsd, todayISO, yearMonthFromISO } from '../lib/format'
import { colors, radius } from '../theme'
import type { CategoryKind, GlanceCategory, MobileGlance } from '../types'

const KIND_ORDER: CategoryKind[] = ['income', 'expense', 'savings']
const KIND_TITLE: Record<CategoryKind, string> = {
  income: 'Income',
  expense: 'Expense',
  savings: 'Savings',
}
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function leftoverTitle(year: number, month: number): string {
  const today = yearMonthFromISO(todayISO())
  if (today && today.year === year && today.month === month) {
    return 'This month leftover'
  }
  return `${MONTH_NAMES[month - 1] ?? `Month ${month}`} leftover`
}

function isTight(row: GlanceCategory): boolean {
  return row.over_budget || Number(row.remaining) < 0
}

interface Props {
  data: MobileGlance | null
  error: string | null
}

export function LeftoverGlance({ data, error }: Props) {
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    rows: (data?.categories ?? []).filter((row) => row.kind === kind),
  })).filter((group) => group.rows.length > 0)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {data ? leftoverTitle(data.year, data.month) : 'This month leftover'}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && !data ? (
        <Text style={styles.muted}>Loading leftover…</Text>
      ) : null}
      {!error && data && groups.length === 0 ? (
        <Text style={styles.muted}>
          No categories yet. Add them on the website, then pull to refresh.
        </Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.kind} style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors[group.kind] }]}>
            {KIND_TITLE[group.kind]}
          </Text>
          {group.rows.map((row) => {
            const warn = isTight(row)
            return (
              <View key={row.category_id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.category_name}
                  </Text>
                  {row.kind === 'savings' && row.balance != null ? (
                    <Text style={styles.balance}>
                      Balance {formatUsd(row.balance)}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.remaining, warn && styles.warnText]}>
                  {formatUsd(row.remaining)}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.warn,
    fontSize: 14,
  },
  group: {
    gap: 4,
    marginTop: 6,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  rowMain: {
    flex: 1,
  },
  name: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  balance: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 1,
  },
  remaining: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  warnText: {
    color: colors.warn,
  },
})
