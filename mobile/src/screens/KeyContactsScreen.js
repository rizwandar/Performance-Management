import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Modal
} from 'react-native'
import { keyContactsApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import FormModal from '../components/FormModal'

const EMERGENCY_FIELDS = [
  { key: 'name',  label: 'Name',             placeholder: 'Emergency contact name' },
  { key: 'phone', label: 'Phone',            placeholder: 'Phone number', keyboardType: 'phone-pad' },
  { key: 'email', label: 'Email (optional)', placeholder: 'their@email.com', keyboardType: 'email-address', autoCapitalize: 'none' },
]

const TRUSTED_FIELDS = [
  { key: 'name',         label: 'Name',             placeholder: 'Full name' },
  { key: 'email',        label: 'Email',            placeholder: 'their@email.com', keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'relationship', label: 'Relationship',     placeholder: 'e.g. spouse, sibling, friend' },
  { key: 'phone',        label: 'Phone (optional)', placeholder: 'Phone number', keyboardType: 'phone-pad' },
]

// Sections that can be granted to trusted contacts (matches server VALID_SECTIONS)
const GRANTABLE_SECTIONS = [
  { id: 'legal_documents',    name: 'Personal & Legal Documents' },
  { id: 'financial_items',    name: 'Financial Affairs' },
  { id: 'funeral_wishes',     name: 'Funeral & End-of-Life Wishes' },
  { id: 'medical_wishes',     name: 'Medical & Care Wishes' },
  { id: 'people_to_notify',   name: 'People to Notify' },
  { id: 'property_items',     name: 'Property & Possessions' },
  { id: 'personal_messages',  name: 'Messages to Loved Ones' },
  { id: 'songs_that_define_me', name: 'Songs That Define Me' },
  { id: 'life_wishes',        name: 'My Bucket List' },
]

export default function KeyContactsScreen() {
  const [emergency, setEmergency]       = useState({ name: '', phone: '', email: '' })
  const [trusted, setTrusted]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [emergencyModal, setEmergencyModal] = useState(false)
  const [trustedModal, setTrustedModal]     = useState(false)
  const [permissionsModal, setPermissionsModal] = useState(false)
  const [editing, setEditing]           = useState(null)
  const [form, setForm]                 = useState({})
  const [saving, setSaving]             = useState(false)
  const [selectedSections, setSelectedSections] = useState([])
  const [savingPerms, setSavingPerms]   = useState(false)

  const load = useCallback(async () => {
    try {
      const [em, tr] = await Promise.all([keyContactsApi.getEmergency(), keyContactsApi.getTrusted()])
      setEmergency(em)
      setTrusted(Array.isArray(tr) ? tr : [])
    } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveEmergency() {
    setSaving(true)
    try { await keyContactsApi.saveEmergency(form); setEmergencyModal(false); load() }
    catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function saveTrusted() {
    if (!form.name?.trim() || !form.email?.trim()) { Alert.alert('Name and email are required.'); return }
    setSaving(true)
    try {
      if (editing) await keyContactsApi.updateTrusted(editing.id, form)
      else         await keyContactsApi.addTrusted(form)
      setTrustedModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function savePermissions() {
    setSavingPerms(true)
    try {
      await keyContactsApi.updatePermissions(editing.id, selectedSections)
      setPermissionsModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSavingPerms(false)
  }

  function openPermissions(contact) {
    setEditing(contact)
    setSelectedSections(contact.visible_sections || [])
    setPermissionsModal(true)
  }

  function toggleSection(id) {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function removeTrusted(id, name) {
    Alert.alert('Remove contact?', `Remove ${name} as a trusted contact?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await keyContactsApi.removeTrusted(id); load() }
        catch { Alert.alert('Could not remove contact.') }
      }}
    ])
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}
      >
        <Text style={styles.intro}>Your emergency contact and the trusted contacts who can access your plans.</Text>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Emergency Contact</Text>
          {emergency.name ? (
            <ItemCard
              title={emergency.name}
              subtitle={[emergency.phone, emergency.email].filter(Boolean).join(' · ')}
              onEdit={() => { setForm({ name: emergency.name || '', phone: emergency.phone || '', email: emergency.email || '' }); setEmergencyModal(true) }}
              onDelete={() => Alert.alert('To remove the emergency contact, clear the name field and save.')}
            />
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={() => { setForm({ name: '', phone: '', email: '' }); setEmergencyModal(true) }}>
              <Text style={styles.addBtnText}>+ Add Emergency Contact</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Trusted Contacts</Text>
          <Text style={styles.hint}>
            Trusted contacts can be notified if you become inactive and given access to specific sections of your plans.
          </Text>
          {trusted.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No trusted contacts added yet.</Text>
            </View>
          ) : (
            trusted.map(tc => (
              <View key={tc.id} style={styles.trustedCard}>
                <TouchableOpacity
                  style={styles.trustedBody}
                  onPress={() => { setEditing(tc); setForm({ name: tc.name || '', email: tc.email || '', relationship: tc.relationship || '', phone: tc.phone || '' }); setTrustedModal(true) }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.trustedName}>{tc.name}</Text>
                  <Text style={styles.trustedSub}>{[tc.relationship, tc.email].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.permSummary}>
                    {tc.visible_sections?.length > 0
                      ? `${tc.visible_sections.length} section${tc.visible_sections.length !== 1 ? 's' : ''} shared`
                      : 'No sections shared yet'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.trustedActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => { setEditing(tc); setForm({ name: tc.name || '', email: tc.email || '', relationship: tc.relationship || '', phone: tc.phone || '' }); setTrustedModal(true) }}>
                    <Text style={styles.actionEdit}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openPermissions(tc)}>
                    <Text style={styles.actionPerms}>Permissions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => removeTrusted(tc.id, tc.name)}>
                    <Text style={styles.actionDelete}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          {trusted.length < 3 && (
            <TouchableOpacity style={styles.addBtn} onPress={() => { setEditing(null); setForm({ name: '', email: '', relationship: '', phone: '' }); setTrustedModal(true) }}>
              <Text style={styles.addBtnText}>+ Add Trusted Contact</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <FormModal visible={emergencyModal} title="Emergency Contact" fields={EMERGENCY_FIELDS} values={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onSave={saveEmergency} onClose={() => setEmergencyModal(false)} saving={saving} />
      <FormModal visible={trustedModal} title={editing ? 'Edit Trusted Contact' : 'Add Trusted Contact'} fields={TRUSTED_FIELDS} values={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onSave={saveTrusted} onClose={() => setTrustedModal(false)} saving={saving} />

      {/* Permissions modal */}
      <Modal visible={permissionsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPermissionsModal(false)}>
        <View style={styles.permHeader}>
          <TouchableOpacity onPress={() => setPermissionsModal(false)}>
            <Text style={styles.permCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.permTitle}>Section Access</Text>
          <TouchableOpacity onPress={savePermissions} disabled={savingPerms}>
            <Text style={[styles.permSave, savingPerms && { opacity: 0.5 }]}>{savingPerms ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.permBody} contentContainerStyle={styles.permContent}>
          <Text style={styles.permIntro}>
            Choose which sections {editing?.name} can access if your inactivity timer expires.
          </Text>
          {GRANTABLE_SECTIONS.map(section => {
            const active = selectedSections.includes(section.id)
            return (
              <TouchableOpacity
                key={section.id}
                style={styles.permRow}
                onPress={() => toggleSection(section.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, active && styles.checkboxActive]}>
                  {active && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.permLabel}>{section.name}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 20 },
  block: { marginBottom: 28 },
  blockTitle: { fontSize: 15, fontWeight: '700', color: THEME.text, marginBottom: 10 },
  hint: { fontSize: 13, color: THEME.textMuted, lineHeight: 20, marginBottom: 12 },
  addBtn: { borderWidth: 1, borderColor: THEME.primary, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: THEME.primary, fontSize: 14, fontWeight: '600' },
  emptyCard: { backgroundColor: THEME.surface, borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 14, color: THEME.textMuted },
  trustedCard: { backgroundColor: THEME.surface, borderRadius: 12, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  trustedBody: { padding: 14 },
  trustedName: { fontSize: 15, fontWeight: '600', color: THEME.text },
  trustedSub: { fontSize: 13, color: THEME.textMuted, marginTop: 2 },
  permSummary: { fontSize: 12, color: THEME.primary, marginTop: 6, fontWeight: '600' },
  trustedActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: THEME.border },
  actionBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRightWidth: 1, borderRightColor: THEME.border },
  actionEdit: { fontSize: 13, color: THEME.primary, fontWeight: '600' },
  actionPerms: { fontSize: 13, color: THEME.accent, fontWeight: '600' },
  actionDelete: { fontSize: 13, color: THEME.danger, fontWeight: '600' },
  permHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: THEME.border, backgroundColor: THEME.surface },
  permTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  permCancel: { fontSize: 16, color: THEME.textMuted },
  permSave: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  permBody: { flex: 1, backgroundColor: THEME.background },
  permContent: { padding: 16, paddingBottom: 40 },
  permIntro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 20 },
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: THEME.border },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: THEME.border, marginRight: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surface },
  checkboxActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  permLabel: { fontSize: 15, color: THEME.text, flex: 1 },
})
