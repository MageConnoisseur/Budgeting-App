import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { LoginScreen } from './src/screens/LoginScreen'
import { TrackerScreen } from './src/screens/TrackerScreen'
import { colors } from './src/theme'

function Root() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.pine} size="large" />
      </View>
    )
  }
  return user ? <TrackerScreen /> : <LoginScreen />
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
