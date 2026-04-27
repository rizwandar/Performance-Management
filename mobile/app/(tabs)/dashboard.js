import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/context/AuthContext'
import { sectionsApi } from '../../src/lib/api'
import { THEME, SECTIONS, GROUPS } from '../../src/lib/theme'

export default function DashboardScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadCounts = useCallback(async () => {
    try {
      const data = await sectionsApi.getCounts()
      setCounts(data || {})
    } catch {
      // counts are non-critical, fail silently
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadCounts() }, [loadCounts])

  function onRefresh() {
    setRefreshing(true)
    loadCounts()
  }

  const firstName = user?.name?.split(' ')[0] || 'there'
  const totalSections = SECTIONS.length
  const startedSections = SECTIONS.filter(s => (counts[s.id] || 0) > 0).length

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />}
    >
      <View style={styles.welcomeRow}>
        <Text style={styles.greeting}>Hello, {firstName}</Text>
        <Text style={styles.progress}>{startedSections} of {totalSections} sections started</Text>
      </View>

      {startedSections === 0 && (
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingTitle}>Welcome to In Good Hands</Text>
          <Text style={styles.onboardingText}>
            This is your personal end-of-life planning space. Work through the sections below at your own pace.
            Everything you record here will be a gift to the people you love.
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />
      ) : (
        GROUPS.map(group => {
          const groupSections = SECTIONS.filter(s => s.group === group.key)
          return (
            <View key={group.key} style={styles.groupBlock}>
              <View style={[styles.groupHeader, { backgroundColor: group.colour }]}>
                <Text style={styles.groupLabel}>{group.label}</Text>
              </View>
              {groupSections.map(section => {
                const count = counts[section.id] || 0
                const started = count > 0
                return (
                  <TouchableOpacity
                    key={section.id}
                    style={styles.card}
                    onPress={() => router.push(`/section/${section.id}`)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>{section.name}</Text>
                    </View>
                    <View style={[styles.badge, started ? styles.badgeStarted : styles.badgeEmpty]}>
                      <Text style={[styles.badgeText, started ? styles.badgeTextStarted : styles.badgeTextEmpty]}>
                        {started ? `${count} item${count !== 1 ? 's' : ''}` : 'Not started'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { padding: 16, paddingBottom: 32 },
  welcomeRow: { marginBottom: 16 },
  greeting: { fontSize: 22, fontWeight: '700', color: THEME.text },
  progress: { fontSize: 13, color: THEME.textMuted, marginTop: 4 },
  onboardingCard: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: THEME.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  onboardingTitle: { fontSize: 16, fontWeight: '700', color: THEME.primary, marginBottom: 8 },
  onboardingText: { fontSize: 14, color: THEME.textMuted, lineHeight: 22 },
  groupBlock: { marginBottom: 20 },
  groupHeader: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  groupLabel: { fontSize: 13, fontWeight: '700', color: THEME.primaryDark, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardContent: { flex: 1, paddingRight: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: THEME.text },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeEmpty: { backgroundColor: THEME.textMuted },
  badgeStarted: { backgroundColor: THEME.primary },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextEmpty: { color: '#fff' },
  badgeTextStarted: { color: '#fff' },
})
