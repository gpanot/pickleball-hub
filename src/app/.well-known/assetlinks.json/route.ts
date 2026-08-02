import { NextResponse } from "next/server";

// Android Digital Asset Links — enables App Links for hub.thecourtflow.com
// SHA-256 fingerprint must match the release keystore registered in Play Console.
// Update ANDROID_SHA256 if/when the signing cert changes.
const ANDROID_SHA256 = process.env.ANDROID_SHA256_CERT ?? "";

export async function GET() {
  const links = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.squadd.thehub.app",
        sha256_cert_fingerprints: ANDROID_SHA256 ? [ANDROID_SHA256] : [],
      },
    },
  ];

  return new NextResponse(JSON.stringify(links, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
