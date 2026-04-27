import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import axios from 'axios'
import { getToken } from './api'

const API_URL = 'https://performance-api-djuk.onrender.com/api'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const tokenData = await Notifications.getExpoPushTokenAsync()
  return tokenData.data
}

export async function syncPushToken() {
  try {
    const pushToken = await registerForPushNotifications()
    if (!pushToken) return

    const authToken = await getToken()
    if (!authToken) return

    await axios.post(
      `${API_URL}/users/me/device-token`,
      { token: pushToken },
      { headers: { Authorization: `Bearer ${authToken}` } }
    )
  } catch {
    // Non-critical — fail silently
  }
}

export async function clearPushToken() {
  try {
    const authToken = await getToken()
    if (!authToken) return
    await axios.post(
      `${API_URL}/users/me/device-token`,
      { token: null },
      { headers: { Authorization: `Bearer ${authToken}` } }
    )
  } catch {}
}
