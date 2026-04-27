import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { THEME } from '../lib/theme'

export default function ItemCard({ title, subtitle, detail, onEdit, onDelete, deleteConfirmMessage }) {
  function confirmDelete() {
    Alert.alert(
      'Remove item',
      deleteConfirmMessage || 'Are you sure you want to remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onDelete },
      ]
    )
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.body} onPress={onEdit} activeOpacity={0.7}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        {!!detail && <Text style={styles.detail} numberOfLines={2}>{detail}</Text>}
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  body: { padding: 14 },
  title: { fontSize: 15, fontWeight: '600', color: THEME.text },
  subtitle: { fontSize: 13, color: THEME.textMuted, marginTop: 3 },
  detail: { fontSize: 13, color: THEME.textMuted, marginTop: 4, lineHeight: 18 },
  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: THEME.border },
  editBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  editText: { fontSize: 13, color: THEME.primary, fontWeight: '600' },
  deleteBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: THEME.border },
  deleteText: { fontSize: 13, color: THEME.danger, fontWeight: '600' },
})
