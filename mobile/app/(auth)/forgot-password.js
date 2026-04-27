import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native'
import { Link } from 'expo-router'
import { authApi } from '../../src/lib/api'
import { THEME } from '../../src/lib/theme'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    if (!email || !dob) {
      Alert.alert('Please enter your email and date of birth.')
      return
    }
    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim().toLowerCase(), dob.trim())
      setSent(true)
    } catch (err) {
      Alert.alert('Request failed', err.response?.data?.error || 'Please check your details and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {sent ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successText}>
                If an account with that email and date of birth exists, we've sent a password reset link.
              </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.button}>
                  <Text style={styles.buttonText}>Back to Sign In</Text>
                </TouchableOpacity>
              </Link>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.subtitle}>
                Enter your email and date of birth to receive a reset link.
              </Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="your@email.com"
                placeholderTextColor={THEME.textMuted}
              />

              <Text style={styles.label}>Date of birth</Text>
              <TextInput
                style={styles.input}
                value={dob}
                onChangeText={setDob}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={THEME.textMuted}
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
              </TouchableOpacity>

              <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.backLink}>
                  <Text style={styles.backText}>Back to Sign In</Text>
                </TouchableOpacity>
              </Link>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
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
  title: { fontSize: 22, fontWeight: '700', color: THEME.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: THEME.textMuted, lineHeight: 20, marginBottom: 8 },
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
  button: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backLink: { alignItems: 'center', marginTop: 16 },
  backText: { fontSize: 14, color: THEME.primary },
  successBox: { alignItems: 'center' },
  successTitle: { fontSize: 20, fontWeight: '700', color: THEME.success, marginBottom: 12 },
  successText: { fontSize: 14, color: THEME.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
})
