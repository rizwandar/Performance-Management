import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, RefreshControl } from 'react-native'
import { legalApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import FormModal from '../components/FormModal'

const DOC_TYPE_OPTIONS = [
  { label: 'Will',            value: 'will' },
  { label: 'POA',             value: 'poa' },
  { label: 'Birth cert.',     value: 'birth_certificate' },
  { label: 'Passport',        value: 'passport' },
  { label: 'Property deed',   value: 'property_deed' },
  { label: 'Insurance',       value: 'insurance' },
  { label: 'Other',           value: 'other' },
]

const ITEM_FIELDS = [
  { key: 'document_type', label: 'Document type', options: DOC_TYPE_OPTIONS },
  { key: 'title',         label: 'Title / description', placeholder: 'e.g. Last Will and Testament' },
  { key: 'held_by',       label: 'Held by',             placeholder: 'Who holds this document?' },
  { key: 'location',      label: 'Location',            placeholder: 'Where is it stored?' },
  { key: 'notes',         label: 'Notes (optional)',    placeholder: 'Any additional notes', multiline: true },
]

const ITEM_EMPTY = { document_type: '', title: '', held_by: '', location: '', notes: '' }
const DOC_LABEL = { will: 'Will', poa: 'Power of Attorney', birth_certificate: 'Birth Certificate', passport: 'Passport', property_deed: 'Property Deed', insurance: 'Insurance', other: 'Other' }

export default function LegalDocumentsScreen() {
  const [unlocked, setUnlocked]   = useState(false)
  const [vaultPw, setVaultPw]     = useState('')
  const [vaultError, setVaultError] = useState('')
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(ITEM_EMPTY)
  const [saving, setSaving]       = useState(false)
  const [sessionPw, setSessionPw] = useState('')

  const load = useCallback(async (pw) => {
    setLoading(true)
    try { setItems(await legalApi.list(pw)) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  async function unlock() {
    if (!vaultPw) { setVaultError('Please enter your vault password.'); return }
    setVerifying(true); setVaultError('')
    try {
      await legalApi.list(vaultPw)
      setSessionPw(vaultPw)
      setUnlocked(true)
      load(vaultPw)
    } catch (err) {
      setVaultError(err.response?.data?.error || 'Incorrect vault password.')
    }
    setVerifying(false)
  }

  function openAdd()      { setEditing(null); setForm(ITEM_EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ document_type: item.document_type || '', title: item.title || '', held_by: item.held_by || '', location: item.location || '', notes: item.notes || '' }); setModal(true) }

  async function save() {
    if (!form.title.trim()) { Alert.alert('A title is required.'); return }
    setSaving(true)
    try {
      if (editing) await legalApi.update(editing.id, { vault_password: sessionPw, ...form })
      else         await legalApi.add({ vault_password: sessionPw, ...form })
      setModal(false); load(sessionPw)
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await legalApi.remove(id); load(sessionPw) } catch { Alert.alert('Could not remove item.') }
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

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(sessionPw) }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Your will, power of attorney, certificates, and other important documents.</Text>
        {loading ? <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 24 }} /> :
          items.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No documents yet. Add your first document below.</Text></View>
          ) : items.map(item => (
            <ItemCard
              key={item.id}
              title={item.title}
              subtitle={[DOC_LABEL[item.document_type], item.held_by].filter(Boolean).join(' · ')}
              detail={item.location ? `Location: ${item.location}` : undefined}
              onEdit={() => openEdit(item)}
              onDelete={() => Alert.alert('Remove document?', `Remove "${item.title}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove(item.id) }])}
            />
          ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Document</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Document' : 'Add Document'} fields={ITEM_FIELDS} values={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onSave={save} onClose={() => setModal(false)} saving={saving} />
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
  emptyCard: { backgroundColor: THEME.surface, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: THEME.textMuted, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
