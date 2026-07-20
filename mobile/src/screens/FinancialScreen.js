import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, RefreshControl } from 'react-native'
import { financialApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { category: '', institution: '', account_type: '', account_reference: '', contact_name: '', contact_phone: '', notes: '' }

const CATEGORY_OPTIONS = [
  { label: 'Bank',        value: 'bank' },
  { label: 'Investment',  value: 'investment' },
  { label: 'Insurance',   value: 'insurance' },
  { label: 'Pension',     value: 'pension' },
  { label: 'Debt',        value: 'debt' },
  { label: 'Other',       value: 'other' },
]

const FIELDS = [
  { key: 'institution',       label: 'Institution',              placeholder: 'Bank, insurer, or provider name' },
  { key: 'category',          label: 'Category',                 options: CATEGORY_OPTIONS },
  { key: 'account_type',      label: 'Account type (optional)',  placeholder: 'e.g. chequing, RRSP, TFSA' },
  { key: 'account_reference', label: 'Account reference',        placeholder: 'Last 4 digits or reference' },
  { key: 'contact_name',      label: 'Contact name (optional)',  placeholder: 'Advisor or rep name' },
  { key: 'contact_phone',     label: 'Contact phone (optional)', placeholder: 'Phone number', keyboardType: 'phone-pad' },
  { key: 'notes',             label: 'Notes (optional)',          placeholder: 'Any other details', multiline: true },
]

const CAT_LABEL = { bank: 'Bank', investment: 'Investment', insurance: 'Insurance', pension: 'Pension', debt: 'Debt', other: 'Other' }

export default function FinancialScreen() {
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
    try { setItems(await financialApi.list(pw)) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  async function unlock() {
    if (!vaultPw) { setVaultError('Please enter your vault password.'); return }
    setVerifying(true); setVaultError('')
    try {
      await financialApi.list(vaultPw)
      setSessionPw(vaultPw)
      setUnlocked(true)
      load(vaultPw)
    } catch (err) {
      setVaultError(err.response?.data?.error || 'Incorrect vault password.')
    }
    setVerifying(false)
  }

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ category: item.category || '', institution: item.institution || '', account_type: item.account_type || '', account_reference: item.account_reference || '', contact_name: item.contact_name || '', contact_phone: item.contact_phone || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.institution.trim() && !form.category) { Alert.alert('Please provide at least an institution or category.'); return }
    setSaving(true)
    try {
      if (editing) await financialApi.update(editing.id, { vault_password: sessionPw, ...form })
      else         await financialApi.add({ vault_password: sessionPw, ...form })
      setModal(false); load(sessionPw)
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await financialApi.remove(id); load(sessionPw) } catch { Alert.alert('Could not remove item.') }
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
        <Text style={styles.intro}>Bank accounts, investments, insurance policies, pensions, and debts.</Text>
        {items.length === 0
          ? <EmptyState message="No financial items yet. Add your first item below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.institution || CAT_LABEL[item.category] || 'Financial item'}
                subtitle={[CAT_LABEL[item.category], item.account_type].filter(Boolean).join(' · ')}
                detail={item.account_reference ? `Ref: ${item.account_reference}` : undefined}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove this financial item?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Item' : 'Add Financial Item'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
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
