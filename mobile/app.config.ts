import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "TheHub",
  slug: "the-hub",
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    eas: { projectId: "" },
  },
});
