import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { id } = await params
  const { role, isActive } = await req.json()

  const data: any = {}
  if (role !== undefined)     data.role     = role
  if (isActive !== undefined) data.isActive = isActive

  const user = await prisma.user.update({
    where: { id },
    data,
  })

  return NextResponse.json({ id: user.id, role: user.role, isActive: user.isActive })
}
