import { prisma } from "@/lib/db";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;
const MAX_RETRIES = 10;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export async function generateSquadCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = randomCode();
    const existing = await prisma.squadCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique squad code after max retries");
}
