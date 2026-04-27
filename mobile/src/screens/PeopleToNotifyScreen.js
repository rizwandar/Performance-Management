import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { notifyApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { name: '', relationship: '', email: '', phone: '', notified_by: '', notes: '' }

const FIELDS = [
  { key: 'name',         label: 'Name',                    placeholder: 'Full name' },
  { key: 'relationship', label: 'Relationship',            placeholder: 'e.g. sister, colleague, neighbour' },
  { key: 'email',        label: 'Email (optional)',         placeholder: 'their@email.com', keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'phone',        label: 'Phone (optional)',         placeholder: 'Phone number', keyboardType: 'phone-pad' },
  { key: 'notified_by',  label: 'Who will notify them?',   placeholder: 'Name of the person responsible' },
  { key: 'notes',        label: 'Notes (optional)',         placeholder: 'Anything else to note', multiline: true },
]

export default function PeopleToNotifyScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await notifyApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ name: item.name || '', relationship: item.relationship || '', email: item.email || '', phone: item.phone || '', notified_by: item.notified_by || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) { Alert.alert('A name is required.'); return }
    setSaving(true)
    try {
      if (editing) await notifyApi.update(editing.id, form)
      else         await notifyApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await notifyApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Who should be informed when you pass, and who will be responsible for telling them.</Text>
        {items.length === 0
          ? <EmptyState message="No people listed yet. Add the first person below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.name}
                subtitle={[item.relationship, item.phone || item.email].filter(Boolean).join(' · ')}
                detail={item.notified_by ? `Notified by: ${item.notified_by}` : undefined}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove ${item.name} from this list?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Person</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Person' : 'Add Person'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
