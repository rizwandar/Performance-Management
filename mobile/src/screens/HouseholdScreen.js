import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
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
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await householdApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ category: item.category || '', title: item.title || '', provider: item.provider || '', account_reference: item.account_reference || '', contact: item.contact || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim()) { Alert.alert('A title is required.'); return }
    setSaving(true)
    try {
      if (editing) await householdApi.update(editing.id, form)
      else         await householdApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await householdApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
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
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
