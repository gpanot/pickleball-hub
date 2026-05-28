import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// connection_limit=10 supports the Promise.all patterns used across API routes
// (auth + follows + sessions run concurrently; friends-going batches 2 queries at once).
// connect_timeout=10 avoids hanging requests if Railway is momentarily unreachable.
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const urlWithPool = DATABASE_URL.includes("?")
  ? `${DATABASE_URL}&connection_limit=10&connect_timeout=10`
  : `${DATABASE_URL}?connection_limit=10&connect_timeout=10`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: urlWithPool } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
