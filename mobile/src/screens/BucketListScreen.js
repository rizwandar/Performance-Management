import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { wishesApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { title: '', description: '', category: '', status: 'dream', notes: '' }

const STATUS_OPTIONS = [
  { label: 'Dream',       value: 'dream' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done',        value: 'done' },
]

const FIELDS = [
  { key: 'title',       label: 'Title',              placeholder: 'What do you want to do?' },
  { key: 'description', label: 'Description',         placeholder: 'Describe this wish...', multiline: true },
  { key: 'category',    label: 'Category (optional)', placeholder: 'e.g. travel, family, adventure' },
  { key: 'status',      label: 'Status',              options: STATUS_OPTIONS },
  { key: 'notes',       label: 'Notes (optional)',    placeholder: 'Any other details', multiline: true },
]

const STATUS_LABEL = { dream: 'Dream', in_progress: 'In Progress', done: 'Done' }

export default function BucketListScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await wishesApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ title: item.title || '', description: item.description || '', category: item.category || '', status: item.status || 'dream', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim()) { Alert.alert('A title is required.'); return }
    setSaving(true)
    try {
      if (editing) await wishesApi.update(editing.id, form)
      else         await wishesApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await wishesApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Things you'd love to do or experience. Track dreams, works in progress, and achievements.</Text>
        {items.length === 0
          ? <EmptyState message="Your bucket list is empty. Add your first wish below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.title}
                subtitle={[item.category, STATUS_LABEL[item.status]].filter(Boolean).join(' · ')}
                detail={item.description}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove "${item.title}" from your bucket list?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Wish</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Wish' : 'Add Wish'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
