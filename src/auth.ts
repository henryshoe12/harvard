import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google sign-in with read access to the athlete's calendars.
// Needs AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (see README).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: keep Google's tokens in the encrypted session cookie.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      // Still valid.
      if (typeof token.expiresAt === "number" && Date.now() < token.expiresAt * 1000 - 60_000) return token;
      // Expired: refresh it.
      if (!token.refreshToken) return { ...token, error: "RefreshTokenError" };
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refreshToken as string,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw data;
        return {
          ...token,
          accessToken: data.access_token,
          expiresAt: Math.floor(Date.now() / 1000 + data.expires_in),
          refreshToken: data.refresh_token ?? token.refreshToken,
        };
      } catch {
        return { ...token, error: "RefreshTokenError" };
      }
    },
    async session({ session, token }) {
      return { ...session, accessToken: token.accessToken as string | undefined, error: token.error as string | undefined };
    },
  },
});

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}
