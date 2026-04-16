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

    async jwt({ token, profile }) {
      if (profile) {
        token.sub       = profile.sub ?? undefined
        token.direction = (profile as any).direction
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
})
