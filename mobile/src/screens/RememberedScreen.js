import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native'
import { rememberedApi } from '../lib/api'
import { THEME } from '../lib/theme'

const FIELDS = [
  { key: 'about_me',        label: 'About me',             placeholder: 'A short description of who you are...' },
  { key: 'remembered_for',  label: 'I\'d like to be remembered for', placeholder: 'What do you hope people remember about you?' },
  { key: 'legacy_message',  label: 'My legacy message',   placeholder: 'A message to leave behind...' },
  { key: 'life_story',      label: 'My life story',        placeholder: 'Share your story in your own words...' },
]

export default function RememberedScreen() {
  const [form, setForm]     = useState({ about_me: '', remembered_for: '', legacy_message: '', life_story: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await rememberedApi.get()
      setForm({ about_me: data.about_me || '', remembered_for: data.remembered_for || '', legacy_message: data.legacy_message || '', life_story: data.life_story || '' })
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    try {
      await rememberedApi.save(form)
      Alert.alert('Saved.')
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Share who you are and how you'd like to be remembered by the people you love.</Text>
      {FIELDS.map(field => (
        <View key={field.key} style={styles.fieldGroup}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={form[field.key]}
            onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
            placeholder={field.placeholder}
            placeholderTextColor={THEME.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      ))}
      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 20 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: THEME.textMuted, marginBottom: 6 },
  input: { backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 12, fontSize: 15, color: THEME.text },
  inputMulti: { minHeight: 110, textAlignVertical: 'top' },
  button: { backgroundColor: THEME.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
