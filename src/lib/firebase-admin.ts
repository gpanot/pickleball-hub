import admin from "firebase-admin";

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;

    console.log("[firebase-admin] init — projectId:", projectId ?? "MISSING",
      "| clientEmail:", clientEmail ?? "MISSING",
      "| privateKey:", rawKey ? `set (${rawKey.length} chars)` : "MISSING"
    );

    if (!projectId || !clientEmail || !rawKey) {
      const missing = [
        !projectId && "FIREBASE_PROJECT_ID",
        !clientEmail && "FIREBASE_CLIENT_EMAIL",
        !rawKey && "FIREBASE_PRIVATE_KEY",
      ].filter(Boolean).join(", ");
      throw new Error(`Missing Firebase Admin credentials: ${missing}`);
    }

    // Normalize: if stored with escaped \n replace them; if already real newlines leave as-is
    const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log("[firebase-admin] initialized for project:", projectId);
  }
  return admin;
}

export const firebaseAdmin = new Proxy({} as typeof admin, {
  get(_, prop) {
    return Reflect.get(getFirebaseAdmin(), prop);
  },
});

export function getMessaging() {
  return getFirebaseAdmin().messaging();
}
