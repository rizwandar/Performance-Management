import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { THEME } from '../lib/theme'

const FREE_SECTIONS = [
  "How I'd Like to Be Remembered",
  'Messages to Loved Ones',
  'Songs That Define Me',
  'My Bucket List',
]

const PREMIUM_SECTIONS = [
  'All 4 free sections',
  'Funeral and End-of-Life Wishes',
  'Medical and Care Wishes',
  'Key Contacts',
  'People to Notify',
  'Children and Dependants',
  'Personal and Legal Documents',
  'Property and Possessions',
  'Financial Affairs',
  'Digital Life (vault-encrypted)',
  'Practical Household Information',
  'Trusted contact access permissions',
  'Document and photo uploads',
  'Full PDF export',
  'Inactivity notifications',
]

export default function UpgradeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Choose Your Plan</Text>
      <Text style={styles.subheading}>
        In Good Hands is free to start. Upgrade to unlock all 14 sections and keep everything your loved ones will need in one place.
      </Text>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Currently all accounts have full Premium access while payment processing is being set up. You will be notified before any billing begins.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.planTitle}>Free</Text>
        <Text style={styles.planPrice}>$0 forever</Text>
        {FREE_SECTIONS.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={[styles.check, { color: THEME.textMuted }]}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, styles.cardHighlight]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>MOST POPULAR</Text>
        </View>
        <Text style={styles.planTitle}>Premium Monthly</Text>
        <Text style={styles.planPrice}>$4.99 / month</Text>
        {PREMIUM_SECTIONS.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={[styles.check, { color: THEME.primary }]}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Coming soon: online payment</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.planTitle}>Premium Annual</Text>
        <Text style={styles.planPrice}>$29.99 / year</Text>
        <Text style={styles.planNote}>Just $2.50/month, saving $30 vs monthly</Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Coming soon: online payment</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: THEME.background },
  content:     { padding: 16, paddingBottom: 40 },
  heading:     { fontSize: 22, fontWeight: '700', color: THEME.primary, marginBottom: 10, textAlign: 'center' },
  subheading:  { fontSize: 14, color: THEME.textMuted, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  notice: {
    backgroundColor: '#EFF7F2', borderRadius: 10, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#C4DCC4',
  },
  noticeText:  { fontSize: 13, color: THEME.primary, lineHeight: 20, textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: '#E0D8D0',
  },
  cardHighlight: { borderColor: THEME.primary, borderWidth: 2 },
  badge: {
    backgroundColor: THEME.primary, borderRadius: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, marginBottom: 12,
  },
  badgeText:   { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  planTitle:   { fontSize: 17, fontWeight: '700', color: THEME.primary, marginBottom: 4 },
  planPrice:   { fontSize: 22, fontWeight: '800', color: THEME.primary, marginBottom: 4 },
  planNote:    { fontSize: 12, color: THEME.textMuted, marginBottom: 16 },
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  check:       { fontSize: 14, fontWeight: '700', marginTop: 1 },
  featureText: { fontSize: 14, color: THEME.text, flex: 1, lineHeight: 20 },
  comingSoon: {
    marginTop: 16, backgroundColor: '#EFF7F2', borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: '#C4DCC4',
  },
  comingSoonText: { fontSize: 13, color: THEME.primary, textAlign: 'center', fontWeight: '600' },
})
