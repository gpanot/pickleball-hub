import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

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

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  })

  return token.data
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
