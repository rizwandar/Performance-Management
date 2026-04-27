import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator
} from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { userApi } from '../../src/lib/api'
import { THEME } from '../../src/lib/theme'

export default function ProfileScreen() {
  const { user, setUser, signOut } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', date_of_birth: '' })
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const data = await userApi.getMe()
      const u = data
      setForm({ name: u.name || '', email: u.email || '', date_of_birth: u.date_of_birth || '' })
    } catch {
      Alert.alert('Could not load profile.')
    } finally {
      setLoading(false)
    }
  }

  function setField(field) {
    return (val) => setForm(f => ({ ...f, [field]: val }))
  }

  async function saveProfile() {
    setSaving(true)
    try {
      await userApi.updateMe({ name: form.name.trim(), email: form.email.trim().toLowerCase(), date_of_birth: form.date_of_birth.trim() })
      const updated = await userApi.getMe()
      setUser(updated)
      Alert.alert('Profile updated.')
    } catch (err) {
      Alert.alert('Save failed', err.response?.data?.error || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword() {
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      Alert.alert('Please fill in all password fields.')
      return
    }
    if (passwords.next !== passwords.confirm) {
      Alert.alert('New passwords do not match.')
      return
    }
    setSavingPassword(true)
    try {
      await userApi.changePassword({ current_password: passwords.current, new_password: passwords.next })
      setPasswords({ current: '', next: '', confirm: '' })
      Alert.alert('Password updated.')
    } catch (err) {
      Alert.alert('Password change failed', err.response?.data?.error || 'Please check your current password.')
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Details</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={setField('name')} autoCapitalize="words" placeholder="Your name" placeholderTextColor={THEME.textMuted} />

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={form.email} onChangeText={setField('email')} autoCapitalize="none" keyboardType="email-address" placeholder="your@email.com" placeholderTextColor={THEME.textMuted} />

        <Text style={styles.label}>Date of birth</Text>
        <TextInput style={styles.input} value={form.date_of_birth} onChangeText={setField('date_of_birth')} placeholder="YYYY-MM-DD" placeholderTextColor={THEME.textMuted} />

        <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={saveProfile} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Change Password</Text>

        <Text style={styles.label}>Current password</Text>
        <TextInput style={styles.input} value={passwords.current} onChangeText={v => setPasswords(p => ({ ...p, current: v }))} secureTextEntry placeholder="Current password" placeholderTextColor={THEME.textMuted} />

        <Text style={styles.label}>New password</Text>
        <TextInput style={styles.input} value={passwords.next} onChangeText={v => setPasswords(p => ({ ...p, next: v }))} secureTextEntry placeholder="New password" placeholderTextColor={THEME.textMuted} />

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput style={styles.input} value={passwords.confirm} onChangeText={v => setPasswords(p => ({ ...p, confirm: v }))} secureTextEntry placeholder="Repeat new password" placeholderTextColor={THEME.textMuted} />

        <TouchableOpacity style={[styles.button, savingPassword && styles.buttonDisabled]} onPress={savePassword} disabled={savingPassword}>
          <Text style={styles.buttonText}>{savingPassword ? 'Updating...' : 'Update Password'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background },
  section: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: THEME.text, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: THEME.textMuted, marginBottom: 6, marginTop: 10 },
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
    padding: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  signOutButton: {
    borderWidth: 1,
    borderColor: THEME.danger,
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: { color: THEME.danger, fontSize: 15, fontWeight: '600' },
})
