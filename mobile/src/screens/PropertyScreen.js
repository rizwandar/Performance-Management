import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { propertyApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { category: '', title: '', description: '', location: '', intended_recipient: '', notes: '' }

const CATEGORY_OPTIONS = [
  { label: 'Real estate', value: 'real_estate' },
  { label: 'Vehicle',     value: 'vehicle' },
  { label: 'Sentimental', value: 'sentimental' },
  { label: 'Pet',         value: 'pet' },
  { label: 'Other',       value: 'other' },
]

const FIELDS = [
  { key: 'title',              label: 'Title',                 placeholder: 'e.g. Family home, Wedding ring' },
  { key: 'category',           label: 'Category',              options: CATEGORY_OPTIONS },
  { key: 'description',        label: 'Description (optional)',placeholder: 'Describe this item', multiline: true },
  { key: 'location',           label: 'Location (optional)',   placeholder: 'Where is it kept?' },
  { key: 'intended_recipient', label: 'Intended recipient',    placeholder: 'Who should receive this?' },
  { key: 'notes',              label: 'Notes (optional)',       placeholder: 'Any other details', multiline: true },
]

const CAT_LABEL = { real_estate: 'Real Estate', vehicle: 'Vehicle', sentimental: 'Sentimental', pet: 'Pet', other: 'Other' }

export default function PropertyScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await propertyApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ category: item.category || '', title: item.title || '', description: item.description || '', location: item.location || '', intended_recipient: item.intended_recipient || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim()) { Alert.alert('A title is required.'); return }
    setSaving(true)
    try {
      if (editing) await propertyApi.update(editing.id, form)
      else         await propertyApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await propertyApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Real estate, vehicles, sentimental items, pets, and anything else that matters.</Text>
        {items.length === 0
          ? <EmptyState message="No items listed yet. Add your first item below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.title}
                subtitle={[CAT_LABEL[item.category], item.intended_recipient ? `To: ${item.intended_recipient}` : null].filter(Boolean).join(' · ')}
                detail={item.description}
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
