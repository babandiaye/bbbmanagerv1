import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { id } = await params
  const { role, isActive } = await req.json()

  const data: any = {}
  if (role !== undefined)     data.role     = role
  if (isActive !== undefined) data.isActive = isActive

  const user = await prisma.user.update({
    where: { id },
    data,
  })

  logger.info(
    { actorId: a.user.id, targetUserId: id, changes: data },
    'Utilisateur modifié (action admin)'
  )

  return NextResponse.json({ id: user.id, role: user.role, isActive: user.isActive })
}
