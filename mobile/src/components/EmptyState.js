import { View, Text, StyleSheet } from 'react-native'
import { THEME } from '../lib/theme'

export default function EmptyState({ message }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message || 'Nothing added yet.'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  text: { fontSize: 14, color: THEME.textMuted, textAlign: 'center', lineHeight: 22 },
})
