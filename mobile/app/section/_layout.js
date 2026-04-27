import { Stack, useLocalSearchParams } from 'expo-router'
import { SECTIONS, THEME } from '../../src/lib/theme'

export default function SectionLayout() {
  const { id } = useLocalSearchParams()
  const section = SECTIONS.find(s => s.id === id)
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: THEME.surface },
        headerTintColor: THEME.primary,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerBackTitle: 'My Plans',
        title: section?.name || 'Section',
      }}
    />
  )
}
