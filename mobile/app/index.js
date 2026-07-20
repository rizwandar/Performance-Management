import { View, ActivityIndicator } from 'react-native'
import { THEME } from '../src/lib/theme'

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background }}>
      <ActivityIndicator size="large" color={THEME.primary} />
    </View>
  )
}
