/**
 * POST /api/upload/image
 * Accepts multipart/form-data with a single "file" field.
 * Compresses + resizes the image with sharp (max 1280px wide, JPEG quality 80).
 * Stores the result at /app/uploads/clubs/{uuid}.jpg
 * Returns { url } with an absolute URL pointing to GET /api/uploads/clubs/{filename}.
 *
 * Auth: requires valid JWT (getMobileUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";

const UPLOAD_DIR =
  process.env.NODE_ENV === "production"
    ? "/app/uploads/clubs"
    : path.join(process.cwd(), ".uploads", "clubs");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB before compression

function resolveBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) return `${proto}://${host}`;
  return "";
}

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
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  // Compress + resize to max 1280px wide, JPEG quality 80
  let compressed: Buffer;
  try {
    compressed = await sharp(Buffer.from(bytes))
      .resize({ width: 1280, withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
  } catch (err) {
    console.error("[POST /api/upload/image] compression failed:", err);
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }

  const filename = `${randomUUID()}.jpg`;

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), compressed);
  } catch (err) {
    console.error("[POST /api/upload/image] write failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const baseUrl = resolveBaseUrl(req);
  const url = `${baseUrl}/api/uploads/clubs/${filename}`;

  return NextResponse.json({ url });
}
