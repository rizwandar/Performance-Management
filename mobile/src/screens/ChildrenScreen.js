import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { childrenApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { name: '', type: 'child', date_of_birth: '', special_needs: '', preferred_guardian: '', guardian_contact: '', alternate_guardian: '', alternate_contact: '', notes: '' }

const TYPE_OPTIONS = [
  { label: 'Child',     value: 'child' },
  { label: 'Adult',     value: 'adult' },
  { label: 'Pet',       value: 'pet' },
  { label: 'Other',     value: 'other' },
]

const FIELDS = [
  { key: 'name',               label: 'Name',                        placeholder: 'Full name' },
  { key: 'type',               label: 'Type',                        options: TYPE_OPTIONS },
  { key: 'date_of_birth',      label: 'Date of birth (optional)',    placeholder: 'YYYY-MM-DD' },
  { key: 'special_needs',      label: 'Special needs (optional)',    placeholder: 'Any care needs or requirements', multiline: true },
  { key: 'preferred_guardian', label: 'Preferred guardian',          placeholder: 'Who should care for them?' },
  { key: 'guardian_contact',   label: 'Guardian contact (optional)', placeholder: 'Phone or email', keyboardType: 'default' },
  { key: 'alternate_guardian', label: 'Alternate guardian (optional)', placeholder: 'Backup guardian name' },
  { key: 'alternate_contact',  label: 'Alternate contact (optional)', placeholder: 'Phone or email' },
  { key: 'notes',              label: 'Notes (optional)',             placeholder: 'Anything else to note', multiline: true },
]

const TYPE_LABEL = { child: 'Child', adult: 'Adult', pet: 'Pet', other: 'Other' }

export default function ChildrenScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await childrenApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) {
    setEditing(item)
    setForm({ name: item.name || '', type: item.type || 'child', date_of_birth: item.date_of_birth || '', special_needs: item.special_needs || '', preferred_guardian: item.preferred_guardian || '', guardian_contact: item.guardian_contact || '', alternate_guardian: item.alternate_guardian || '', alternate_contact: item.alternate_contact || '', notes: item.notes || '' })
    setModal(true)
  }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) { Alert.alert('A name is required.'); return }
    setSaving(true)
    try {
      if (editing) await childrenApi.update(editing.id, form)
      else         await childrenApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await childrenApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Record your guardianship wishes and care instructions for those who depend on you.</Text>
        {items.length === 0
          ? <EmptyState message="No dependants listed yet. Add the first person or pet below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.name}
                subtitle={[TYPE_LABEL[item.type], item.date_of_birth].filter(Boolean).join(' · ')}
                detail={item.preferred_guardian ? `Guardian: ${item.preferred_guardian}` : undefined}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove ${item.name} from this list?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Dependant</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Dependant' : 'Add Dependant'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
