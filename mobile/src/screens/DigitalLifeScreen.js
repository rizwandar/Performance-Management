import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, RefreshControl } from 'react-native'
import { digitalApi } from '../lib/api'
import { THEME } from '../lib/theme'
import FormModal from '../components/FormModal'

const CRED_FIELDS = [
  { key: 'service',     label: 'Service or account name', placeholder: 'e.g. Gmail, Facebook, Netflix' },
  { key: 'service_url', label: 'Website (optional)',      placeholder: 'https://...', keyboardType: 'url', autoCapitalize: 'none' },
  { key: 'username',    label: 'Username or email',       placeholder: 'Login username', autoCapitalize: 'none' },
  { key: 'password',    label: 'Password',                placeholder: 'Password', secure: true },
  { key: 'notes',       label: 'Notes (optional)',        placeholder: 'Any other details', multiline: true },
]

const CRED_EMPTY = { service: '', service_url: '', username: '', password: '', notes: '' }

export default function DigitalLifeScreen() {
  const [vaultStatus, setVaultStatus] = useState(null)
  const [unlocked, setUnlocked]       = useState(false)
  const [vaultPw, setVaultPw]         = useState('')
  const [newVaultPw, setNewVaultPw]   = useState('')
  const [vaultError, setVaultError]   = useState('')
  const [items, setItems]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [verifying, setVerifying]     = useState(false)
  const [modal, setModal]             = useState(false)
  const [editing, setEditing]         = useState(null)
  const [form, setForm]               = useState(CRED_EMPTY)
  const [saving, setSaving]           = useState(false)
  const [sessionPw, setSessionPw]     = useState('')
  const [showPass, setShowPass]       = useState({})

  useEffect(() => {
    digitalApi.checkVault().then(r => setVaultStatus(r)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const loadCreds = useCallback(async (pw) => {
    try { setItems(await digitalApi.list(pw)) } catch {}
    setRefreshing(false)
  }, [])

  async function setupVault() {
    if (newVaultPw.length < 8) { setVaultError('Vault password must be at least 8 characters.'); return }
    setVerifying(true); setVaultError('')
    try {
      await digitalApi.setupVault(newVaultPw)
      setVaultStatus({ exists: true })
      setSessionPw(newVaultPw)
      setUnlocked(true)
      loadCreds(newVaultPw)
    } catch (err) { setVaultError(err.response?.data?.error || 'Could not set up vault.') }
    setVerifying(false)
  }

  async function unlock() {
    if (!vaultPw) { setVaultError('Please enter your vault password.'); return }
    setVerifying(true); setVaultError('')
    try {
      await digitalApi.verifyVault(vaultPw)
      setSessionPw(vaultPw)
      setUnlocked(true)
      loadCreds(vaultPw)
    } catch (err) { setVaultError(err.response?.data?.error || 'Incorrect vault password.') }
    setVerifying(false)
  }

  function openAdd()      { setEditing(null); setForm(CRED_EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ service: item.service || '', service_url: item.service_url || '', username: item.username || '', password: item.password || '', notes: item.notes || '' }); setModal(true) }

  async function save() {
    if (!form.service.trim()) { Alert.alert('Service name is required.'); return }
    setSaving(true)
    try {
      const payload = { vault_password: sessionPw, ...form }
      if (editing) await digitalApi.update(editing.id, payload)
      else         await digitalApi.add(payload)
      setModal(false); loadCreds(sessionPw)
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id, service) {
    Alert.alert('Remove credential?', `Remove "${service}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await digitalApi.remove(id, sessionPw); loadCreds(sessionPw) } catch { Alert.alert('Could not remove.') }
      }}
    ])
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  if (!vaultStatus?.exists) {
    return (
      <View style={styles.gateContainer}>
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Set Up Your Vault</Text>
          <Text style={styles.gateText}>Create a vault password to encrypt your digital credentials. This password is never stored on our servers. If you lose it, this data cannot be recovered.</Text>
          <TextInput style={styles.input} value={newVaultPw} onChangeText={setNewVaultPw} secureTextEntry placeholder="Choose a vault password (8+ characters)" placeholderTextColor={THEME.textMuted} autoCapitalize="none" />
          {!!vaultError && <Text style={styles.error}>{vaultError}</Text>}
          <TouchableOpacity style={[styles.button, verifying && styles.buttonDisabled]} onPress={setupVault} disabled={verifying}>
            <Text style={styles.buttonText}>{verifying ? 'Setting up...' : 'Create Vault'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (!unlocked) {
    return (
      <View style={styles.gateContainer}>
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Vault Locked</Text>
          <Text style={styles.gateText}>Enter your vault password to view your encrypted digital credentials.</Text>
          <TextInput style={styles.input} value={vaultPw} onChangeText={setVaultPw} secureTextEntry placeholder="Vault password" placeholderTextColor={THEME.textMuted} autoCapitalize="none" />
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
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCreds(sessionPw) }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Your email accounts, social media, subscriptions, and other online accounts. All encrypted.</Text>
        {items.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>No credentials yet. Add your first account below.</Text></View>
        ) : items.map(item => (
          <View key={item.id} style={styles.credCard}>
            <View style={styles.credBody}>
              <Text style={styles.credService}>{item.service}</Text>
              {!!item.service_url && <Text style={styles.credUrl}>{item.service_url}</Text>}
              <Text style={styles.credField}>Username: <Text style={styles.credValue}>{item.username || '—'}</Text></Text>
              <TouchableOpacity onPress={() => setShowPass(p => ({ ...p, [item.id]: !p[item.id] }))}>
                <Text style={styles.credField}>Password: <Text style={styles.credValue}>{showPass[item.id] ? (item.password || '—') : '••••••••'}</Text></Text>
              </TouchableOpacity>
              {!!item.notes && <Text style={styles.credNotes}>{item.notes}</Text>}
            </View>
            <View style={styles.credActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => remove(item.id, item.service)}>
                <Text style={styles.deleteText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Account</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Account' : 'Add Account'} fields={CRED_FIELDS} values={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onSave={save} onClose={() => setModal(false)} saving={saving} />
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
  credCard: { backgroundColor: THEME.surface, borderRadius: 12, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  credBody: { padding: 14 },
  credService: { fontSize: 15, fontWeight: '700', color: THEME.text, marginBottom: 2 },
  credUrl: { fontSize: 12, color: THEME.textMuted, marginBottom: 6 },
  credField: { fontSize: 13, color: THEME.textMuted, marginTop: 4 },
  credValue: { color: THEME.text, fontWeight: '500' },
  credNotes: { fontSize: 13, color: THEME.textMuted, marginTop: 6, lineHeight: 18 },
  credActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: THEME.border },
  editBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  editText: { fontSize: 13, color: THEME.primary, fontWeight: '600' },
  deleteBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: THEME.border },
  deleteText: { fontSize: 13, color: THEME.danger, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
