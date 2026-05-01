import { handlers } from "@/auth";
// NextAuth v5 beta handlers — type assertion needed for Next.js 16 strict route types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = handlers.GET as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = handlers.POST as any;
