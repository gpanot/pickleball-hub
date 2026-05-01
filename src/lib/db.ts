import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Keep a small connection pool to reduce cold-start TCP overhead on Railway.
// connection_limit=3 prevents the default pool (10+) from slowing the first query.
// connect_timeout=10 avoids hanging requests if Railway is momentarily unreachable.
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const urlWithPool = DATABASE_URL.includes("?")
  ? `${DATABASE_URL}&connection_limit=3&connect_timeout=10`
  : `${DATABASE_URL}?connection_limit=3&connect_timeout=10`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: urlWithPool } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
