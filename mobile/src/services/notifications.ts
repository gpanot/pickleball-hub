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
  console.log('[push] registerForPushNotifications called')
  console.log('[push] Platform:', Platform.OS, '| isDevice:', Device.isDevice, '| isExpoGo:', IS_EXPO_GO)
  console.log('[push] Device brand:', Device.brand, '| modelName:', Device.modelName, '| osVersion:', Device.osVersion)

  if (IS_EXPO_GO) {
    console.warn('[push] Expo Go does not support FCM. Use a dev client or standalone build.')
    return null
  }

  if (!Device.isDevice) {
    console.warn('[push] Push notifications require a physical device.')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  console.log('[push] existing permission status:', existingStatus)
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    console.log('[push] requesting permission...')
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
    console.log('[push] permission after request:', finalStatus)
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] Notification permission denied (final status:', finalStatus, ')')
    return null
  }

  if (Platform.OS === 'android') {
    console.log('[push] Setting Android notification channel...')
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f5a623',
    })
    console.log('[push] Android channel set.')
  }

  for (let attempt = 1; attempt <= MAX_TOKEN_RETRIES; attempt++) {
    try {
      console.log(`[push] getDevicePushTokenAsync attempt ${attempt}/${MAX_TOKEN_RETRIES}...`)
      const deviceToken = await Notifications.getDevicePushTokenAsync()
      const tokenStr = deviceToken.data as string
      console.log('[push] native device token obtained — type:', deviceToken.type, '| prefix:', tokenStr.slice(0, 30) + '...')
      return tokenStr
    } catch (err: any) {
      const isTransient =
        err?.message?.includes('SERVICE_NOT_AVAILABLE') ||
        err?.message?.includes('NETWORK_ERROR')

      console.error(`[push] getDevicePushTokenAsync failed (attempt ${attempt}) — message:`, err?.message, '| isTransient:', isTransient)

      if (isTransient && attempt < MAX_TOKEN_RETRIES) {
        const delay = 1000 * attempt
        console.warn(`[push] retrying in ${delay}ms...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      console.error('[push] giving up after', attempt, 'attempts. Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
      return null
    }
  }

  return null
}

/**
 * Checks the current push notification registration state.
 * Returns a diagnostic object for debugging.
 */
export async function getPushDiagnostics(): Promise<{
  isDevice: boolean
  isExpoGo: boolean
  platform: string
  permissionStatus: string
  tokenType?: string
  tokenPrefix?: string
  error?: string
}> {
  const diag: ReturnType<typeof getPushDiagnostics> extends Promise<infer T> ? T : never = {
    isDevice: Device.isDevice ?? false,
    isExpoGo: IS_EXPO_GO,
    platform: Platform.OS,
    permissionStatus: 'unknown',
  }

  try {
    const { status } = await Notifications.getPermissionsAsync()
    diag.permissionStatus = status

    if (!IS_EXPO_GO && Device.isDevice && status === 'granted') {
      const deviceToken = await Notifications.getDevicePushTokenAsync()
      diag.tokenType = deviceToken.type
      diag.tokenPrefix = (deviceToken.data as string).slice(0, 30)
    }
  } catch (err: any) {
    diag.error = err?.message ?? String(err)
  }

  return diag
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
