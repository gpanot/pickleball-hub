import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";

/**
 * Wrap the default PrismaAdapter so that NextAuth's "session" operations
 * use our `authSession` model instead of the app's `session` model (pickleball sessions).
 */
function buildAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createSession: (data: { sessionToken: string; userId: string; expires: Date }) =>
      prisma.authSession.create({ data }) as Promise<AdapterSession>,
    getSessionAndUser: async (sessionToken: string) => {
      const result = await prisma.authSession.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!result) return null;
      const { user, ...session } = result;
      return { session: session as AdapterSession, user: user as AdapterUser };
    },
    updateSession: (data: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">) =>
      prisma.authSession.update({
        where: { sessionToken: data.sessionToken },
        data,
      }) as Promise<AdapterSession>,
    deleteSession: (sessionToken: string) =>
      prisma.authSession.delete({ where: { sessionToken } }) as Promise<AdapterSession>,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: buildAdapter(),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
    async signIn({ user }) {
      // After Google login, if the request carries a localProfileId cookie,
      // link the anonymous PlayerProfile to this User record.
      // The linkage happens in a separate API call post-redirect (see /api/auth/link-profile).
      return true;
    },
  },
  pages: {
    // Use default NextAuth pages
  },
});
