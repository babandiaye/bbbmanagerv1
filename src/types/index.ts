import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id:        string
      email:     string
      fullName:  string
      role:      UserRole
      direction: string
      isActive:  boolean
    }
  }
}

export type { UserRole }
