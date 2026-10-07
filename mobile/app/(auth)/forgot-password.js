import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native'
import { Link } from 'expo-router'
import { authApi } from '../../src/lib/api'
import { THEME } from '../../src/lib/theme'

// This screen used to branch on the 'dob' password reset method, collecting a
// date of birth and expecting a reset token back in the response so the new
// password could be set in-app. Both halves of that were dead:
//
//   - POST /auth/forgot-password has always answered with one generic message
//     and never a token, whatever the configured method, so the in-app
//     password step could never be reached (SEC-04/SEC-05: a different answer
//     would be an account-enumeration oracle).
//   - 'dob' is no longer a method the server will resolve to at all. It maps
//     back to 'email' in server/lib/passwordResetMethod.js, because
//     registration stopped collecting a date of birth on 2026-10-06 and the
//     check would otherwise lock every newer account out of self-serve reset.
//
// So the only flow here is the emailed link. 'security_question' is a real
// method the server can still require and this screen does not implement it;
// a request would be refused with a clear message from the server. Mobile is
// not a build target (see CLAUDE.md), so that gap is left as it was rather
// than built out here.
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  // Show confirmation after submit
  const [emailSent, setEmailSent] = useState(false)

  async function handleVerify() {
    if (!email) {
      Alert.alert('Please enter your email address.')
      return
    }
    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim().toLowerCase())
      setEmailSent(true)
    } catch (err) {
      Alert.alert('Request failed', err.response?.data?.error || 'Please check your details and try again.')
    } finally {
      setLoading(false)
    }
  }

  function renderContent() {
    // Sent confirmation
    if (emailSent) {
      return (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Check your email</Text>
          <Text style={styles.successText}>
            If that email address is registered, we have sent a password reset link. Check your inbox and follow the link.
          </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )
    }

    // Initial form
    return (
      <>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we will send you a reset link.
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

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Text>
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.backLink}>
            <Text style={styles.backText}>Back to Sign In</Text>
          </TouchableOpacity>
        </Link>
      </>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {renderContent()}
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
