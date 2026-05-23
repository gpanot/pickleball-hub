import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "TheHub",
  slug: "the-hub",
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    eas: { projectId: "06420ce0-0582-4866-afa5-5ec6e0b6c4ce" },
  },
});
