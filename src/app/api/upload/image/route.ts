/**
 * POST /api/upload/image
 * Accepts multipart/form-data with a single "file" field.
 * Stores the file on the local filesystem at /app/uploads/clubs/{uuid}.{ext}
 * (the Dockerfile ensures this directory exists on Railway).
 * Returns { url } pointing to GET /api/uploads/clubs/{filename}.
 *
 * Auth: requires valid JWT (getMobileUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR =
  process.env.NODE_ENV === "production"
    ? "/app/uploads/clubs"
    : path.join(process.cwd(), ".uploads", "clubs");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WEBP, or GIF images are allowed" },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const filename = `${randomUUID()}.${ext}`;

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(bytes));
  } catch (err) {
    console.error("[POST /api/upload/image] write failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const url = `${baseUrl}/api/uploads/clubs/${filename}`;

  return NextResponse.json({ url });
}
