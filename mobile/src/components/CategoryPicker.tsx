import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, radius } from '../theme'
import type { Category } from '../types'

interface Props {
  categories: Category[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}

export function CategoryPicker({ categories, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const selected = categories.find((c) => c.id === value)

  return (
    <View>
      <Text style={styles.label}>Category</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selected ? `Category, ${selected.name}` : 'Choose a category'
        }
        disabled={disabled || categories.length === 0}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          pressed && styles.pressed,
          (disabled || categories.length === 0) && styles.disabled,
        ]}
      >
        <Text style={selected ? styles.value : styles.placeholder}>
          {selected?.name ?? (categories.length ? 'Choose…' : 'None yet')}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Expense category</Text>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {categories.map((c) => {
              const active = c.id === value
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    active && styles.optionActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[styles.optionText, active && styles.optionTextActive]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  field: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  placeholder: {
    color: colors.muted,
    fontSize: 16,
  },
  chevron: {
    color: colors.muted,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.55,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  link: {
    color: colors.pine,
    fontSize: 16,
    fontWeight: '600',
  },
  option: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.paper2,
  },
  optionActive: {
    backgroundColor: colors.successBg,
  },
  optionText: {
    color: colors.ink,
    fontSize: 17,
  },
  optionTextActive: {
    color: colors.pine,
    fontWeight: '700',
  },
})
