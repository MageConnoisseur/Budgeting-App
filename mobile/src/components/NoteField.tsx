import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as txApi from '../api/transactions'
import { formatUsd } from '../lib/format'
import { colors, radius } from '../theme'
import type { NoteSuggestion } from '../types'

interface Props {
  value: string
  categoryId?: string
  onChange: (value: string) => void
  onPick?: (suggestion: NoteSuggestion) => void
}

export function NoteField({ value, categoryId, onChange, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NoteSuggestion[]>([])

  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      void txApi
        .suggestNotes({
          q: value.trim() || undefined,
          category_id: categoryId || undefined,
          limit: 6,
        })
        .then((res) => setItems(res.items))
        .catch(() => setItems([]))
    }, 200)
    return () => clearTimeout(handle)
  }, [value, categoryId, open])

  return (
    <View>
      <Text style={styles.label}>Note</Text>
      <TextInput
        value={value}
        onChangeText={(next) => {
          onChange(next)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a suggestion tap registers before the list unmounts.
          setTimeout(() => setOpen(false), 150)
        }}
        placeholder="Optional — Costco, coffee…"
        placeholderTextColor={colors.muted}
        style={styles.input}
        maxLength={2000}
        autoCorrect
        accessibilityLabel="Note"
      />
      {open && items.length > 0 ? (
        <View style={styles.list} accessibilityRole="list">
          {items.map((item) => (
            <Pressable
              key={`${item.note}-${item.last_category_id}`}
              onPress={() => {
                onChange(item.note)
                onPick?.(item)
                setOpen(false)
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.note}>{item.note}</Text>
              <Text style={styles.meta}>
                {formatUsd(item.last_amount)} · {item.last_category_name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 16,
  },
  list: {
    marginTop: 6,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.paper2,
  },
  pressed: {
    backgroundColor: colors.paper2,
  },
  note: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
})
