import NextAuth from 'next-auth'
import KeycloakProvider from 'next-auth/providers/keycloak'
import { prisma } from '@/lib/prisma'

const ALLOWED_DIRECTION = process.env.ALLOWED_DIRECTION ?? 'DITSI'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const direction = (profile as any)?.direction

      // Bloquer tout utilisateur hors DITSI
      if (direction !== ALLOWED_DIRECTION) {
        return false
      }

      // Upsert en base
      await prisma.user.upsert({
        where: { kcSub: profile!.sub! },
        update: {
          email:             profile!.email ?? '',
          preferredUsername: (profile as any).preferred_username ?? '',
          givenName:         (profile as any).given_name ?? null,
          familyName:        (profile as any).family_name ?? null,
          fullName:          (profile as any).name ?? null,
          direction:         direction,
          lastLogin:         new Date(),
        },
        create: {
          kcSub:             profile!.sub!,
          email:             profile!.email ?? '',
          preferredUsername: (profile as any).preferred_username ?? '',
          givenName:         (profile as any).given_name ?? null,
          familyName:        (profile as any).family_name ?? null,
          fullName:          (profile as any).name ?? null,
          direction:         direction,
          role:              'auditeur',
        },
      })

      return true
    },

    async session({ session, token }) {
      if (token.sub) {
        const user = await prisma.user.findUnique({
          where: { kcSub: token.sub },
        })
        if (user) {
          session.user.id        = user.id
          session.user.role      = user.role
          session.user.direction = user.direction
          session.user.isActive  = user.isActive
          session.user.fullName  = user.fullName ?? ''
        }
      }
      return session
    },

    async jwt({ token, profile, account }) {
      if (profile) {
        token.sub       = profile.sub ?? undefined
        token.direction = (profile as any).direction
      }
      // Conserver l'id_token Keycloak pour la déconnexion complète
      if (account?.id_token) {
        token.id_token = account.id_token
      }
      return token
    },
  },
  events: {
    // Déconnexion complète : invalide aussi la session côté Keycloak
    async signOut(message) {
      const idToken = 'token' in message ? (message.token as any)?.id_token : null
      if (idToken && process.env.KEYCLOAK_ISSUER) {
        try {
          const logoutUrl = new URL(
            `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
          )
          logoutUrl.searchParams.set('id_token_hint', idToken as string)
          if (process.env.NEXTAUTH_URL) {
            logoutUrl.searchParams.set('post_logout_redirect_uri', `${process.env.NEXTAUTH_URL}/login`)
          }
          await fetch(logoutUrl.toString())
        } catch {
          // Ignorer les erreurs — la session NextAuth est déjà supprimée côté app
        }
      }
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
})
