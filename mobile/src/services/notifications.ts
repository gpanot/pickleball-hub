import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Registers for push notifications and returns the native FCM/APNs device token.
 * We use getDevicePushTokenAsync (not getExpoPushTokenAsync) because the backend
 * sends notifications directly via Firebase Admin SDK, which requires native tokens.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f5a623',
    })
  }

  try {
    const deviceToken = await Notifications.getDevicePushTokenAsync()
    console.log('[push] native device token obtained:', deviceToken.type, deviceToken.data?.toString().slice(0, 20) + '...')
    return deviceToken.data as string
  } catch (err) {
    console.warn('[push] failed to get device push token:', err)
    return null
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
