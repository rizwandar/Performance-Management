import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { THEME } from '../../src/lib/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: THEME.surface },
        headerTintColor: THEME.primary,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        tabBarStyle: {
          backgroundColor: THEME.surface,
          borderTopColor: THEME.border,
          paddingBottom: 6,
          height: 60,
        },
        tabBarActiveTintColor: THEME.primary,
        tabBarInactiveTintColor: THEME.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'My Plans',
          tabBarLabel: 'My Plans',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
