import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'

export async function GET() {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id:                true,
      fullName:          true,
      email:             true,
      preferredUsername: true,
      direction:         true,
      role:              true,
      isActive:          true,
      lastLogin:         true,
      createdAt:         true,
    },
  })

  return NextResponse.json(users)
}
