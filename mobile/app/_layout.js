import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { View, ActivityIndicator } from 'react-native'
import { THEME } from '../src/lib/theme'

function RootGuard() {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    if (!user && !inAuth) {
      router.replace('/(auth)/login')
    } else if (user && inAuth) {
      router.replace('/(tabs)/dashboard')
    }
  }, [user, loading, segments])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background }}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="section" options={{ headerShown: false }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" backgroundColor={THEME.background} />
      <RootGuard />
    </AuthProvider>
  )
}
