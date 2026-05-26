import admin from "firebase-admin";

type ServiceAccountJson = {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
};

let initializedFingerprint: string | null = null;

function credentialFingerprint(cred: ServiceAccountJson): string {
  if (cred.private_key_id) return cred.private_key_id;
  const key = cred.private_key ?? "";
  const body = key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return body.slice(-16) || "unknown";
}

/** Parse FIREBASE_SERVICE_ACCOUNT_JSON (preferred) or legacy split env vars. */
function loadServiceAccount(): ServiceAccountJson {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    let parsed: ServiceAccountJson;
    try {
      parsed = JSON.parse(rawJson) as ServiceAccountJson;
    } catch (e) {
      console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
      throw e;
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON missing project_id, client_email, or private_key"
      );
    }
    // JSON.parse already turns \n in the file into real newlines; fix double-escaped keys from some hosts
    if (parsed.private_key.includes("\\n")) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    const missing = [
      !rawJson && "FIREBASE_SERVICE_ACCOUNT_JSON",
      !projectId && "FIREBASE_PROJECT_ID",
      !clientEmail && "FIREBASE_CLIENT_EMAIL",
      !rawKey && "FIREBASE_PRIVATE_KEY",
    ].filter(Boolean);
    throw new Error(
      `Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (recommended) or: ${missing.join(", ")}`
    );
  }

  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function getFirebaseAdmin() {
  const serviceAccount = loadServiceAccount();
  const fingerprint = credentialFingerprint(serviceAccount);

  if (admin.apps.length && initializedFingerprint !== fingerprint) {
    console.log(
      "[firebase-admin] credential changed — deleting old app (was:",
      initializedFingerprint,
      "now:",
      fingerprint,
      ")"
    );
    void admin.apps[0]?.delete();
  }

  if (!admin.apps.length || initializedFingerprint !== fingerprint) {
    console.log(
      "[firebase-admin] init — projectId:",
      serviceAccount.project_id,
      "| clientEmail:",
      serviceAccount.client_email,
      "| keyId:",
      fingerprint,
      "| source:",
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "FIREBASE_SERVICE_ACCOUNT_JSON" : "split env vars"
    );

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id!,
        clientEmail: serviceAccount.client_email!,
        privateKey: serviceAccount.private_key!,
      }),
    });

    initializedFingerprint = fingerprint;
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
