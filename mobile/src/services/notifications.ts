import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

const IS_EXPO_GO = Constants.appOwnership === 'expo'
const MAX_TOKEN_RETRIES = 5

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Registers for push notifications and returns the native FCM/APNs device token.
 * Uses getDevicePushTokenAsync (not getExpoPushTokenAsync) because the backend
 * sends via Firebase Admin SDK which requires native FCM tokens.
 * Includes retry logic for transient FCM SERVICE_NOT_AVAILABLE errors.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (IS_EXPO_GO) {
    console.warn('[push] Expo Go does not support FCM. Use a dev client or standalone build.')
    return null
  }

  if (!Device.isDevice) {
    console.warn('[push] Push notifications require a physical device.')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] Notification permission denied.')
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f5a623',
    })
  }

  for (let attempt = 1; attempt <= MAX_TOKEN_RETRIES; attempt++) {
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync()
      const tokenStr = deviceToken.data as string
      console.log('[push] native device token obtained:', deviceToken.type, tokenStr.slice(0, 20) + '...')
      return tokenStr
    } catch (err: any) {
      const isTransient =
        err?.message?.includes('SERVICE_NOT_AVAILABLE') ||
        err?.message?.includes('NETWORK_ERROR')

      if (isTransient && attempt < MAX_TOKEN_RETRIES) {
        console.warn(`[push] transient error (attempt ${attempt}/${MAX_TOKEN_RETRIES}), retrying...`, err.message)
        await new Promise((r) => setTimeout(r, 1000 * attempt))
        continue
      }
      console.error('[push] failed to get device push token:', err)
      return null
    }
  }

  return null
}

export function useNotificationListeners(
  onNotification: (n: Notifications.Notification) => void,
  onResponse: (r: Notifications.NotificationResponse) => void
) {
  const notifListener = Notifications.addNotificationReceivedListener(onNotification)
  const responseListener = Notifications.addNotificationResponseReceivedListener(onResponse)
  return () => {
    Notifications.removeNotificationSubscription(notifListener)
    Notifications.removeNotificationSubscription(responseListener)
  }
}
