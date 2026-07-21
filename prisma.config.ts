
import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` (e.g. Vercel postinstall) does not connect to the DB — only
// needs a valid URL shape. Real URL must be set on Vercel/Railway for runtime.
// Migrations are managed by dbmate (db/migrations/), not Prisma.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://build:build@127.0.0.1:5432/build?sslmode=disable";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
