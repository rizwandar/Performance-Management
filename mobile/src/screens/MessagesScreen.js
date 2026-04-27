import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { messagesApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { recipient_name: '', relationship: '', message: '', notes: '' }

const FIELDS = [
  { key: 'recipient_name', label: 'Recipient name', placeholder: 'Who is this message for?' },
  { key: 'relationship',   label: 'Relationship',   placeholder: 'e.g. daughter, best friend' },
  { key: 'message',        label: 'Your message',   placeholder: 'Write your message here...', multiline: true },
  { key: 'notes',          label: 'Notes (optional)', placeholder: 'Any additional notes', multiline: true },
]

export default function MessagesScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await messagesApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ recipient_name: item.recipient_name || '', relationship: item.relationship || '', message: item.message || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.recipient_name.trim()) { Alert.alert('A recipient name is required.'); return }
    setSaving(true)
    try {
      if (editing) await messagesApi.update(editing.id, form)
      else         await messagesApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await messagesApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Write personal messages or letters for the people who matter most to you.</Text>
        {items.length === 0
          ? <EmptyState message="No messages yet. Add your first message below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.recipient_name}
                subtitle={item.relationship}
                detail={item.message}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove message for ${item.recipient_name}?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Message</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Message' : 'New Message'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
