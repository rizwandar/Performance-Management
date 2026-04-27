import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '../../src/context/AuthContext'
import { THEME } from '../../src/lib/theme'

export default function RegisterScreen() {
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', date_of_birth: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  function set(field) {
    return (val) => setForm(f => ({ ...f, [field]: val }))
  }

  async function handleRegister() {
    if (!form.name || !form.email || !form.date_of_birth || !form.password) {
      Alert.alert('Please fill in all fields.')
      return
    }
    if (form.password !== form.confirm) {
      Alert.alert('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        date_of_birth: form.date_of_birth.trim(),
        password: form.password,
      })
    } catch (err) {
      Alert.alert('Registration failed', err.response?.data?.error || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>In Good Hands</Text>
          <Text style={styles.tagline}>Start planning with care.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>

          {[
            { label: 'Full name',        field: 'name',          placeholder: 'Your name',          keyboard: 'default',       secure: false },
            { label: 'Email',            field: 'email',         placeholder: 'your@email.com',     keyboard: 'email-address', secure: false },
            { label: 'Date of birth',    field: 'date_of_birth', placeholder: 'YYYY-MM-DD',         keyboard: 'default',       secure: false },
            { label: 'Password',         field: 'password',      placeholder: 'Choose a password',  keyboard: 'default',       secure: true  },
            { label: 'Confirm password', field: 'confirm',       placeholder: 'Repeat password',    keyboard: 'default',       secure: true  },
          ].map(({ label, field, placeholder, keyboard, secure }) => (
            <View key={field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[field]}
                onChangeText={set(field)}
                autoCapitalize={field === 'name' ? 'words' : 'none'}
                keyboardType={keyboard}
                secureTextEntry={secure}
                placeholder={placeholder}
                placeholderTextColor={THEME.textMuted}
              />
            </View>
          ))}

          <Text style={styles.hint}>
            Your date of birth is used to recover your account if you forget your password.
          </Text>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Sign in</Text>
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 48 },
  header: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 28, fontWeight: '700', color: THEME.primary, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: THEME.textMuted, marginTop: 6 },
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
  hint: { fontSize: 12, color: THEME.textMuted, marginTop: 12, lineHeight: 18 },
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
