import { ExpoConfig, ConfigContext } from "expo/config";

const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  "140906288105-oa9csuarionhlcsksjjeakcrqob2auvn.apps.googleusercontent.com";

const REVERSED_CLIENT_ID = IOS_CLIENT_ID
  ? `com.googleusercontent.apps.${IOS_CLIENT_ID.split(".apps.googleusercontent.com")[0]}`
  : "";

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
  ios: {
    ...(config.ios ?? {}),
    bundleIdentifier: "com.squadd.thehub.app",
    usesAppleSignIn: true,
    infoPlist: {
      ...(config.ios?.infoPlist ?? {}),
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ["com.squadd.thehub.app"],
        },
        ...(REVERSED_CLIENT_ID
          ? [
              {
                CFBundleTypeRole: "Editor",
                CFBundleURLSchemes: [REVERSED_CLIENT_ID],
              },
            ]
          : []),
      ],
    },
  },
  android: {
    ...(config.android ?? {}),
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#0a0a0a",
    },
  },
  plugins: [
    ...(Array.isArray(config.plugins) ? config.plugins : []),
    "expo-apple-authentication",
    "./scripts/with-google-service-info",
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    googleIosClientId: IOS_CLIENT_ID,
    eas: { projectId: "06420ce0-0582-4866-afa5-5ec6e0b6c4ce" },
  },
});
