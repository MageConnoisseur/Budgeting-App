import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { LoginScreen } from './src/screens/LoginScreen'
import { TrackerScreen } from './src/screens/TrackerScreen'
import { colors } from './src/theme'
import { useLogLaunch } from './src/useLogLaunch'

function Root() {
  const { hasSession, loading } = useAuth()
  const launch = useLogLaunch()
  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.pine} size="large" />
      </View>
    )
  }
  if (!hasSession) return <LoginScreen />
  return <TrackerScreen launch={launch} />
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
