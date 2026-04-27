import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { medicalApi } from '../lib/api'
import { THEME } from '../lib/theme'
import FormModal from '../components/FormModal'

const ORGAN_OPTIONS = [
  { label: 'Yes',          value: 'yes' },
  { label: 'No',           value: 'no' },
  { label: 'Specific',     value: 'specific' },
  { label: 'Not decided',  value: 'undecided' },
]

const DNR_OPTIONS = [
  { label: 'Yes',          value: 'yes' },
  { label: 'No',           value: 'no' },
  { label: 'Not decided',  value: 'undecided' },
]

const FIELDS = [
  { key: 'organ_donation',          label: 'Organ donation',               options: ORGAN_OPTIONS },
  { key: 'organ_donation_details',  label: 'Organ donation details',       placeholder: 'e.g. all organs, or specific ones', multiline: true },
  { key: 'dnr_preference',          label: 'Do Not Resuscitate (DNR)',      options: DNR_OPTIONS },
  { key: 'gp_name',                 label: 'Family doctor',                placeholder: 'Dr. name' },
  { key: 'gp_phone',                label: 'Doctor phone',                 placeholder: 'Phone number', keyboardType: 'phone-pad' },
  { key: 'hospital_preference',     label: 'Preferred hospital',           placeholder: 'Hospital name' },
  { key: 'current_medications',     label: 'Current medications',          placeholder: 'List any current medications', multiline: true },
  { key: 'medical_conditions',      label: 'Medical conditions',           placeholder: 'Important medical history', multiline: true },
  { key: 'directive_location',      label: 'Advance directive location',   placeholder: 'Where is the document stored?' },
  { key: 'notes',                   label: 'Additional notes',             placeholder: 'Any other medical wishes', multiline: true },
]

const EMPTY = { organ_donation: '', organ_donation_details: '', dnr_preference: '', gp_name: '', gp_phone: '', hospital_preference: '', current_medications: '', medical_conditions: '', directive_location: '', notes: '' }

export default function MedicalWishesScreen() {
  const [data, setData]       = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try { setData(await medicalApi.get()) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit() {
    setForm({ organ_donation: data.organ_donation || '', organ_donation_details: data.organ_donation_details || '', dnr_preference: data.dnr_preference || '', gp_name: data.gp_name || '', gp_phone: data.gp_phone || '', hospital_preference: data.hospital_preference || '', current_medications: data.current_medications || '', medical_conditions: data.medical_conditions || '', directive_location: data.directive_location || '', notes: data.notes || '' })
    setModal(true)
  }

  async function save() {
    setSaving(true)
    try { await medicalApi.save(form); setModal(false); load() }
    catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  const hasData = Object.values(data).some(v => v && String(v).trim())

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Your advance care directives, organ donation wishes, and medical preferences.</Text>
        {!hasData ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No wishes recorded yet. Tap below to add your preferences.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {data.organ_donation      ? <Row label="Organ donation"     value={data.organ_donation} /> : null}
            {data.organ_donation_details ? <Row label="Donation details" value={data.organ_donation_details} /> : null}
            {data.dnr_preference      ? <Row label="DNR"                value={data.dnr_preference} /> : null}
            {data.gp_name             ? <Row label="Family doctor"      value={data.gp_name + (data.gp_phone ? ` · ${data.gp_phone}` : '')} /> : null}
            {data.hospital_preference ? <Row label="Preferred hospital" value={data.hospital_preference} /> : null}
            {data.current_medications ? <Row label="Medications"        value={data.current_medications} /> : null}
            {data.medical_conditions  ? <Row label="Conditions"         value={data.medical_conditions} /> : null}
            {data.directive_location  ? <Row label="Directive location" value={data.directive_location} /> : null}
            {data.notes               ? <Row label="Notes"              value={data.notes} /> : null}
          </View>
        )}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openEdit}>
        <Text style={styles.fabText}>{hasData ? 'Edit Wishes' : '+ Add Wishes'}</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title="Medical Wishes" fields={FIELDS} values={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onSave={save} onClose={() => setModal(false)} saving={saving} />
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
