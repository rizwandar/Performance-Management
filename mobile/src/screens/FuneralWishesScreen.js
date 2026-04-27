import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native'
import { funeralApi } from '../lib/api'
import { THEME } from '../lib/theme'
import FormModal from '../components/FormModal'

const BURIAL_OPTIONS = [
  { label: 'Burial',      value: 'burial' },
  { label: 'Cremation',   value: 'cremation' },
  { label: 'Green',       value: 'green' },
  { label: 'No preference', value: 'no_preference' },
]

const FIELDS = [
  { key: 'burial_preference',  label: 'Burial preference',         options: BURIAL_OPTIONS },
  { key: 'ceremony_type',      label: 'Ceremony type',             placeholder: 'e.g. religious, secular, celebration of life' },
  { key: 'ceremony_location',  label: 'Ceremony location',         placeholder: 'Where you\'d like it held' },
  { key: 'funeral_home',       label: 'Preferred funeral home',    placeholder: 'Name of the funeral home (optional)' },
  { key: 'music_preferences',  label: 'Music preferences',         placeholder: 'Songs or style of music', multiline: true },
  { key: 'readings',           label: 'Readings or prayers',       placeholder: 'Any specific readings', multiline: true },
  { key: 'flowers_preference', label: 'Flowers',                   placeholder: 'Favourite flowers or no flowers' },
  { key: 'donation_charity',   label: 'Donation charity',          placeholder: 'In lieu of flowers, donate to...' },
  { key: 'special_requests',   label: 'Special requests',          placeholder: 'Anything else you\'d like', multiline: true },
  { key: 'notes',              label: 'Additional notes',          placeholder: 'Any other wishes', multiline: true },
]

const EMPTY = { burial_preference: '', ceremony_type: '', ceremony_location: '', funeral_home: '', music_preferences: '', readings: '', flowers_preference: '', donation_charity: '', special_requests: '', notes: '' }

export default function FuneralWishesScreen() {
  const [data, setData]         = useState(EMPTY)
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setData(await funeralApi.get()) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit() {
    setForm({ burial_preference: data.burial_preference || '', ceremony_type: data.ceremony_type || '', ceremony_location: data.ceremony_location || '', funeral_home: data.funeral_home || '', music_preferences: data.music_preferences || '', readings: data.readings || '', flowers_preference: data.flowers_preference || '', donation_charity: data.donation_charity || '', special_requests: data.special_requests || '', notes: data.notes || '' })
    setModal(true)
  }

  async function save() {
    setSaving(true)
    try { await funeralApi.save(form); setModal(false); load() }
    catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  const BURIAL_LABEL = { burial: 'Burial', cremation: 'Cremation', green: 'Green burial', no_preference: 'No preference' }

  const hasData = Object.values(data).some(v => v && String(v).trim())

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Record your wishes for your funeral, burial or cremation, and ceremony.</Text>
        {!hasData ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No wishes recorded yet. Tap below to add your preferences.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {data.burial_preference ? <Row label="Burial preference" value={BURIAL_LABEL[data.burial_preference] || data.burial_preference} /> : null}
            {data.ceremony_type     ? <Row label="Ceremony type"     value={data.ceremony_type} /> : null}
            {data.ceremony_location ? <Row label="Location"          value={data.ceremony_location} /> : null}
            {data.funeral_home      ? <Row label="Funeral home"      value={data.funeral_home} /> : null}
            {data.music_preferences ? <Row label="Music"             value={data.music_preferences} /> : null}
            {data.readings          ? <Row label="Readings"          value={data.readings} /> : null}
            {data.flowers_preference? <Row label="Flowers"           value={data.flowers_preference} /> : null}
            {data.donation_charity  ? <Row label="Donation"          value={data.donation_charity} /> : null}
            {data.special_requests  ? <Row label="Special requests"  value={data.special_requests} /> : null}
            {data.notes             ? <Row label="Notes"             value={data.notes} /> : null}
          </View>
        )}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openEdit}>
        <Text style={styles.fabText}>{hasData ? 'Edit Wishes' : '+ Add Wishes'}</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title="Funeral Wishes" fields={FIELDS} values={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  card: { backgroundColor: THEME.surface, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  emptyCard: { backgroundColor: THEME.surface, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: THEME.textMuted, textAlign: 'center', lineHeight: 22 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  rowLabel: { fontSize: 12, fontWeight: '600', color: THEME.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 14, color: THEME.text, lineHeight: 20 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
