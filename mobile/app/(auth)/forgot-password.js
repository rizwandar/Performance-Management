import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native'
import { Link } from 'expo-router'
import { authApi, settingsApi } from '../../src/lib/api'
import { THEME } from '../../src/lib/theme'

export default function ForgotPasswordScreen() {
  const [method, setMethod] = useState(null)   // null while loading
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)

  // dob flow: after identity verified, collect new password in-app
  const [resetToken, setResetToken] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // email flow: show confirmation after submit
  const [emailSent, setEmailSent] = useState(false)

  // dob flow: show success after password updated
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    settingsApi.getPublic()
      .then(s => setMethod(s.password_reset_method || 'email'))
      .catch(() => setMethod('email'))
  }, [])

  async function handleVerify() {
    if (!email) {
      Alert.alert('Please enter your email address.')
      return
    }
    if (method === 'dob' && !dob) {
      Alert.alert('Please enter your date of birth.')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.forgotPassword(email.trim().toLowerCase(), method === 'dob' ? dob.trim() : null)
      if (method === 'dob') {
        setResetToken(res.token)
      } else {
        setEmailSent(true)
      }
    } catch (err) {
      Alert.alert('Request failed', err.response?.data?.error || 'Please check your details and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Please fill in both password fields.')
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(resetToken, newPassword)
      setResetDone(true)
    } catch (err) {
      Alert.alert('Reset failed', err.response?.data?.error || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function renderContent() {
    // Loading setting
    if (method === null) {
      return <Text style={styles.loadingText}>Loading...</Text>
    }

    // Email method: sent confirmation
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

    // DOB method: password reset done
    if (resetDone) {
      return (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Password updated</Text>
          <Text style={styles.successText}>Your password has been reset. You can now sign in with your new password.</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )
    }

    // DOB method: identity verified, collect new password
    if (resetToken) {
      return (
        <>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subtitle}>Identity verified. Enter your new password below.</Text>

          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="At least 8 characters"
            placeholderTextColor={THEME.textMuted}
          />

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Repeat password"
            placeholderTextColor={THEME.textMuted}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleReset}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Reset Password'}</Text>
          </TouchableOpacity>
        </>
      )
    }

    // Initial form (email method or dob method)
    return (
      <>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          {method === 'dob'
            ? 'Enter your email and date of birth to verify your identity.'
            : 'Enter your email address and we will send you a reset link.'}
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

        {method === 'dob' && (
          <>
            <Text style={styles.label}>Date of birth</Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={setDob}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={THEME.textMuted}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Sending...' : method === 'dob' ? 'Verify and Continue' : 'Send Reset Link'}
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
  loadingText: { color: THEME.textMuted, textAlign: 'center', paddingVertical: 24 },
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
