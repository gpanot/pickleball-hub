import admin from "firebase-admin";

// Track which key ID was used to initialize the current app instance.
// If the env var changes (new key deployed), we delete the old app and reinit.
let initializedWithKeyId: string | null = null;

function extractKeyId(rawKey: string): string {
  // Use last 16 chars of the base64 body as a cheap fingerprint
  const body = rawKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return body.slice(-16);
}

function getFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    const missing = [
      !projectId && "FIREBASE_PROJECT_ID",
      !clientEmail && "FIREBASE_CLIENT_EMAIL",
      !rawKey && "FIREBASE_PRIVATE_KEY",
    ].filter(Boolean).join(", ");
    throw new Error(`Missing Firebase Admin credentials: ${missing}`);
  }

  const currentKeyId = extractKeyId(rawKey);

  // If the key changed (e.g. new service account deployed), tear down the old app
  if (admin.apps.length && initializedWithKeyId !== currentKeyId) {
    console.log("[firebase-admin] key fingerprint changed — deleting old app and reinitializing");
    void admin.apps[0]?.delete();
  }

  if (!admin.apps.length || initializedWithKeyId !== currentKeyId) {
    console.log(
      "[firebase-admin] init — projectId:", projectId,
      "| clientEmail:", clientEmail,
      "| keyFingerprint:", currentKeyId,
      "| privateKeyLen:", rawKey.length
    );

    // Normalize: escaped \n → real newlines
    const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }

    initializedWithKeyId = currentKeyId;
    console.log("[firebase-admin] initialized for project:", projectId, "keyId:", currentKeyId);
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
