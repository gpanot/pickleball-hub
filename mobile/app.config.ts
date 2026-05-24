import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "SQUADD",
  slug: "the-hub",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "cover",
    backgroundColor: "#0a0a0a",
  },
  notification: {
    icon: "./assets/notification-icon.png",
    color: "#f5a623",
  },
  android: {
    ...(config.android ?? {}),
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#0a0a0a",
    },
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    eas: { projectId: "06420ce0-0582-4866-afa5-5ec6e0b6c4ce" },
  },
});
