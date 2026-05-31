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
 * On iOS, getDevicePushTokenAsync returns a raw APNs token (hex string)
 * which is NOT a valid FCM registration token. We need @react-native-firebase/messaging
 * to convert it to an FCM token that Firebase Admin SDK can use.
 */
async function getIosFcmToken(): Promise<string | null> {
  try {
    const messagingModule = await import('@react-native-firebase/messaging')
    const messaging = messagingModule.default

    // Do NOT call requestPermission() — expo-notifications already requested
    // the system permission above. Calling it again crashes on iOS.
    const authStatus = await messaging().hasPermission()
    const enabled =
      authStatus === 1 || // AuthorizationStatus.AUTHORIZED
      authStatus === 2    // AuthorizationStatus.PROVISIONAL

    if (!enabled) {
      console.warn('[push] iOS Firebase messaging permission not granted:', authStatus)
      return null
    }

    // registerDeviceForRemoteMessages can throw if APNs isn't ready yet —
    // wrap in try/catch and continue regardless (getToken will fail gracefully)
    try {
      if (!messaging().isDeviceRegisteredForRemoteMessages) {
        await messaging().registerDeviceForRemoteMessages()
      }
    } catch (regErr: any) {
      console.warn('[push] registerDeviceForRemoteMessages failed (non-fatal):', regErr?.message)
    }

    const fcmToken = await messaging().getToken()
    if (!fcmToken) {
      console.warn('[push] iOS FCM getToken returned empty token')
      return null
    }
    console.log('[push] iOS FCM token obtained — prefix:', fcmToken.slice(0, 30) + '...')
    return fcmToken
  } catch (err: any) {
    console.error('[push] iOS FCM getToken failed:', err?.message)
    return null
  }
}

/**
 * Registers for push notifications and returns a valid FCM registration token.
 * - Android: uses expo-notifications getDevicePushTokenAsync (returns FCM token directly)
 * - iOS: uses @react-native-firebase/messaging to get a proper FCM token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  console.log('[push] registerForPushNotifications called')
  console.log('[push] Platform:', Platform.OS, '| isDevice:', Device.isDevice, '| isExpoGo:', IS_EXPO_GO)

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

  // iOS: use Firebase messaging to get proper FCM token
  if (Platform.OS === 'ios') {
    return getIosFcmToken()
  }

  // Android: getDevicePushTokenAsync returns FCM token directly
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
      if (Platform.OS === 'ios') {
        const fcmToken = await getIosFcmToken()
        if (fcmToken) {
          diag.tokenType = 'fcm'
          diag.tokenPrefix = fcmToken.slice(0, 30)
        }
      } else {
        const deviceToken = await Notifications.getDevicePushTokenAsync()
        diag.tokenType = deviceToken.type
        diag.tokenPrefix = (deviceToken.data as string).slice(0, 30)
      }
    }
  } catch (err: any) {
    diag.error = err?.message ?? String(err)
  }

  return diag
}

/**
 * Upload a push token to the backend. Call this after getting a new token
 * or when the FCM token refreshes.
 */
export async function uploadPushToken(token: string, platform: string, authedFetch: (url: string, opts?: RequestInit) => Promise<Response>): Promise<void> {
  try {
    const res = await authedFetch('/api/players/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    })
    console.log('[push] token upload response:', res.status, '| platform:', platform, '| prefix:', token.slice(0, 20))
  } catch (err) {
    console.warn('[push] token upload failed', err)
  }
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
