import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '../../src/context/AuthContext'
import { THEME } from '../../src/lib/theme'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch (err) {
      Alert.alert('Sign in failed', err.response?.data?.error || 'Please check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>In Good Hands</Text>
          <Text style={styles.tagline}>Everything they need to carry on, in good hands.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="your@email.com"
            placeholderTextColor={THEME.textMuted}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="Your password"
            placeholderTextColor={THEME.textMuted}
          />

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.forgotLink}>
              <Text style={styles.forgotText}>Forgot your password?</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Create one</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 28, fontWeight: '700', color: THEME.primary, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: THEME.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  title: { fontSize: 22, fontWeight: '700', color: THEME.text, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: THEME.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.background,
  },
  forgotLink: { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { fontSize: 13, color: THEME.primary },
  button: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 14, color: THEME.textMuted },
  footerLink: { fontSize: 14, color: THEME.primary, fontWeight: '600' },
})
