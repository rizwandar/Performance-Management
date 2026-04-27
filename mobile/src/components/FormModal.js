import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native'
import { THEME } from '../lib/theme'

/**
 * fields: [{ key, label, placeholder, multiline, keyboardType, secure, options }]
 * options: [{ label, value }] — renders a simple pill-picker instead of TextInput
 */
export default function FormModal({ visible, title, fields, values, onChange, onSave, onClose, saving }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onSave} disabled={saving}>
            <Text style={[styles.save, saving && styles.saveDisabled]}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {fields.map(field => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={styles.label}>{field.label}</Text>
              {field.options ? (
                <View style={styles.pills}>
                  {field.options.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.pill, values[field.key] === opt.value && styles.pillActive]}
                      onPress={() => onChange(field.key, opt.value)}
                    >
                      <Text style={[styles.pillText, values[field.key] === opt.value && styles.pillTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={[styles.input, field.multiline && styles.inputMulti]}
                  value={values[field.key] || ''}
                  onChangeText={v => onChange(field.key, v)}
                  placeholder={field.placeholder || ''}
                  placeholderTextColor={THEME.textMuted}
                  multiline={field.multiline}
                  numberOfLines={field.multiline ? 4 : 1}
                  keyboardType={field.keyboardType || 'default'}
                  secureTextEntry={field.secure}
                  autoCapitalize={field.autoCapitalize || 'sentences'}
                />
              )}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    backgroundColor: THEME.surface,
  },
  title: { fontSize: 16, fontWeight: '700', color: THEME.text },
  cancel: { fontSize: 16, color: THEME.textMuted },
  save: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  saveDisabled: { opacity: 0.5 },
  body: { flex: 1, backgroundColor: THEME.background },
  bodyContent: { padding: 16, paddingBottom: 40 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: THEME.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: THEME.text,
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
  },
  pillActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  pillText: { fontSize: 13, color: THEME.textMuted, fontWeight: '600' },
  pillTextActive: { color: '#fff' },
})
