import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

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
