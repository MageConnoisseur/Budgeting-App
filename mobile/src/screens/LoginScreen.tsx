import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ApiError } from '../api/client'
import { apiBaseUrl } from '../api/config'
import { useAuth } from '../context/AuthContext'
import { colors, radius } from '../theme'

export function LoginScreen() {
  const { login, oauthError, clearOauthError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [openingGoogle, setOpeningGoogle] = useState(false)

  async function onGoogle() {
    setError(null)
    clearOauthError()
    setOpeningGoogle(true)
    try {
      await Linking.openURL(
        `${apiBaseUrl()}/api/auth/oauth/google/start?intent=login&client=mobile`,
      )
    } catch {
      setError('Could not open Google sign-in.')
    } finally {
      setOpeningGoogle(false)
    }
  }

  async function onSubmit() {
    if (!username.trim()) {
      setError('Enter your username or email.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    clearOauthError()
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Sign in failed',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <Text style={styles.brand}>Setaside</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.lede}>
            Log expenses on the go. Planning, budgets, and the dashboard stay on
            the website.
          </Text>

          <Pressable
            onPress={() => void onGoogle()}
            disabled={openingGoogle || submitting}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.pressed,
              (openingGoogle || submitting) && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Text style={styles.googleText}>
              {openingGoogle ? 'Opening Google…' : 'Continue with Google'}
            </Text>
          </Pressable>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.label}>Username or email</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            accessibilityLabel="Username or email"
            style={styles.input}
            placeholder="you or you@email"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="current-password"
            textContentType="password"
            importantForAutofill="yes"
            accessibilityLabel="Password"
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
          />

          {error || oauthError ? (
            <Text style={styles.error}>{error || oauthError}</Text>
          ) : null}

          <Pressable
            onPress={() => void onSubmit()}
            disabled={submitting}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              submitting && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={styles.buttonText}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            Same account as the website. Google opens in the browser, then
            brings you back here. This app only logs expenses.
          </Text>
          <Text style={styles.api}>API: {apiBaseUrl()}</Text>
        </View>
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
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
  },
  brand: {
    color: colors.pine,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  lede: {
    color: colors.inkSoft,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 22,
  },
  googleButton: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    color: colors.muted,
    fontSize: 13,
  },
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
    marginBottom: 16,
  },
  error: {
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: 12,
    borderRadius: radius.sm,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.pine,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
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
    opacity: 0.6,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 20,
  },
  api: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 12,
  },
})
