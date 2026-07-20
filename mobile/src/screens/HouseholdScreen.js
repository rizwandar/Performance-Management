import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, RefreshControl } from 'react-native'
import { householdApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { category: '', title: '', provider: '', account_reference: '', contact: '', notes: '' }

const CATEGORY_OPTIONS = [
  { label: 'Utilities',  value: 'utilities' },
  { label: 'Insurance',  value: 'insurance' },
  { label: 'Security',   value: 'security' },
  { label: 'Subscriptions', value: 'subscriptions' },
  { label: 'Other',      value: 'other' },
]

const FIELDS = [
  { key: 'title',             label: 'Title',                  placeholder: 'e.g. Electricity, Alarm code, Netflix' },
  { key: 'category',          label: 'Category',               options: CATEGORY_OPTIONS },
  { key: 'provider',          label: 'Provider (optional)',    placeholder: 'Company or service name' },
  { key: 'account_reference', label: 'Account ref (optional)', placeholder: 'Account number or reference' },
  { key: 'contact',           label: 'Contact (optional)',     placeholder: 'Phone number or website' },
  { key: 'notes',             label: 'Notes (optional)',        placeholder: 'Alarm codes, instructions, etc.', multiline: true },
]

const CAT_LABEL = { utilities: 'Utilities', insurance: 'Insurance', security: 'Security', subscriptions: 'Subscriptions', other: 'Other' }

export default function HouseholdScreen() {
  const [unlocked, setUnlocked]     = useState(false)
  const [vaultPw, setVaultPw]       = useState('')
  const [vaultError, setVaultError] = useState('')
  const [verifying, setVerifying]   = useState(false)
  const [sessionPw, setSessionPw]   = useState('')

  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async (pw) => {
    setLoading(true)
    try { setItems(await householdApi.list(pw)) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  async function unlock() {
    if (!vaultPw) { setVaultError('Please enter your vault password.'); return }
    setVerifying(true); setVaultError('')
    try {
      await householdApi.list(vaultPw)
      setSessionPw(vaultPw)
      setUnlocked(true)
      load(vaultPw)
    } catch (err) {
      setVaultError(err.response?.data?.error || 'Incorrect vault password.')
    }
    setVerifying(false)
  }

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ category: item.category || '', title: item.title || '', provider: item.provider || '', account_reference: item.account_reference || '', contact: item.contact || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim()) { Alert.alert('A title is required.'); return }
    setSaving(true)
    try {
      if (editing) await householdApi.update(editing.id, { vault_password: sessionPw, ...form })
      else         await householdApi.add({ vault_password: sessionPw, ...form })
      setModal(false); load(sessionPw)
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await householdApi.remove(id); load(sessionPw) } catch { Alert.alert('Could not remove item.') }
  }

  if (!unlocked) {
    return (
      <View style={styles.gateContainer}>
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Vault Protected</Text>
          <Text style={styles.gateText}>This section is protected by your vault password. Enter it below to unlock.</Text>
          <TextInput
            style={styles.input}
            value={vaultPw}
            onChangeText={setVaultPw}
            secureTextEntry
            placeholder="Vault password"
            placeholderTextColor={THEME.textMuted}
            autoCapitalize="none"
          />
          {!!vaultError && <Text style={styles.error}>{vaultError}</Text>}
          <TouchableOpacity style={[styles.button, verifying && styles.buttonDisabled]} onPress={unlock} disabled={verifying}>
            <Text style={styles.buttonText}>{verifying ? 'Unlocking...' : 'Unlock'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(sessionPw) }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Utilities, alarm codes, bills, subscriptions, and day-to-day household details.</Text>
        {items.length === 0
          ? <EmptyState message="No household information yet. Add your first item below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.title}
                subtitle={[CAT_LABEL[item.category], item.provider].filter(Boolean).join(' · ')}
                detail={item.notes}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove "${item.title}"?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Item' : 'Add Item'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  gateContainer: { flex: 1, backgroundColor: THEME.background, justifyContent: 'center', padding: 24 },
  gateCard: { backgroundColor: THEME.surface, borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  gateTitle: { fontSize: 20, fontWeight: '700', color: THEME.text, marginBottom: 8 },
  gateText: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 12, fontSize: 15, color: THEME.text, backgroundColor: THEME.background, marginBottom: 8 },
  error: { fontSize: 13, color: THEME.danger, marginBottom: 8 },
  button: { backgroundColor: THEME.primary, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
