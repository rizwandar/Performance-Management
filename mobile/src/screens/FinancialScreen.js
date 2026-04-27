import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { financialApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'

const EMPTY = { category: '', institution: '', account_type: '', account_reference: '', contact_name: '', contact_phone: '', notes: '' }

const CATEGORY_OPTIONS = [
  { label: 'Bank',        value: 'bank' },
  { label: 'Investment',  value: 'investment' },
  { label: 'Insurance',   value: 'insurance' },
  { label: 'Pension',     value: 'pension' },
  { label: 'Debt',        value: 'debt' },
  { label: 'Other',       value: 'other' },
]

const FIELDS = [
  { key: 'institution',       label: 'Institution',              placeholder: 'Bank, insurer, or provider name' },
  { key: 'category',          label: 'Category',                 options: CATEGORY_OPTIONS },
  { key: 'account_type',      label: 'Account type (optional)',  placeholder: 'e.g. chequing, RRSP, TFSA' },
  { key: 'account_reference', label: 'Account reference',        placeholder: 'Last 4 digits or reference' },
  { key: 'contact_name',      label: 'Contact name (optional)',  placeholder: 'Advisor or rep name' },
  { key: 'contact_phone',     label: 'Contact phone (optional)', placeholder: 'Phone number', keyboardType: 'phone-pad' },
  { key: 'notes',             label: 'Notes (optional)',          placeholder: 'Any other details', multiline: true },
]

const CAT_LABEL = { bank: 'Bank', investment: 'Investment', insurance: 'Insurance', pension: 'Pension', debt: 'Debt', other: 'Other' }

export default function FinancialScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try { setItems(await financialApi.getAll()) } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd()      { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(item) { setEditing(item); setForm({ category: item.category || '', institution: item.institution || '', account_type: item.account_type || '', account_reference: item.account_reference || '', contact_name: item.contact_name || '', contact_phone: item.contact_phone || '', notes: item.notes || '' }); setModal(true) }
  function change(k, v)   { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.institution.trim() && !form.category) { Alert.alert('Please provide at least an institution or category.'); return }
    setSaving(true)
    try {
      if (editing) await financialApi.update(editing.id, form)
      else         await financialApi.add(form)
      setModal(false); load()
    } catch (err) { Alert.alert('Save failed', err.response?.data?.error || 'Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    try { await financialApi.remove(id); load() } catch { Alert.alert('Could not remove item.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}>
        <Text style={styles.intro}>Bank accounts, investments, insurance policies, pensions, and debts.</Text>
        {items.length === 0
          ? <EmptyState message="No financial items yet. Add your first item below." />
          : items.map(item => (
              <ItemCard
                key={item.id}
                title={item.institution || CAT_LABEL[item.category] || 'Financial item'}
                subtitle={[CAT_LABEL[item.category], item.account_type].filter(Boolean).join(' · ')}
                detail={item.account_reference ? `Ref: ${item.account_reference}` : undefined}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item.id)}
                deleteConfirmMessage={`Remove this financial item?`}
              />
            ))
        }
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabText}>+ Add Item</Text>
      </TouchableOpacity>
      <FormModal visible={modal} title={editing ? 'Edit Item' : 'Add Financial Item'} fields={FIELDS} values={form} onChange={change} onSave={save} onClose={() => setModal(false)} saving={saving} />
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  intro: { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: THEME.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
