import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { songsApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { title: '', artist: '', album: '', why_meaningful: '' }

const FIELDS = [
  { key: 'title',          label: 'Song title',           placeholder: 'Name of the song' },
  { key: 'artist',         label: 'Artist',               placeholder: 'Artist or band name' },
  { key: 'album',          label: 'Album (optional)',      placeholder: 'Album name' },
  { key: 'why_meaningful', label: 'Why is this meaningful?', placeholder: 'What does this song mean to you?', multiline: true },
]

export default function SongsScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await songsApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ title: item.title || '', artist: item.artist || '', album: item.album || '', why_meaningful: item.why_meaningful || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.title.trim() || !form.artist.trim()) { Alert.alert('Song title and artist are required.'); return }
    setSaving(true)
    try {
      if (editing) await songsApi.update(editing.id, { why_meaningful: form.why_meaningful })
      else         await songsApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await songsApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Add songs that have shaped your life. You can add up to 50 songs.</Text>
        {items.length === 0
          ? <EmptyState message="No songs added yet. Add your first song below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.title}
                subtitle={`${item.artist}${item.album ? ` — ${item.album}` : ''}`}
                detail={item.why_meaningful}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove "${item.title}"?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Song</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Song' : 'Add Song'} fields={editing ? FIELDS.slice(3) : FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
