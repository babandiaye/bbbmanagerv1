import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { id } = await params
  const { name, url, secret, isActive } = await req.json()

  const data: any = {}
  if (name)     data.name     = name
  if (url)      data.url      = url.replace(/\/$/, '')
  if (secret)   data.secretEnc = encrypt(secret)
  if (isActive !== undefined) data.isActive = isActive

  const server = await prisma.bbbServer.update({
    where: { id },
    data,
  })

  return NextResponse.json({ id: server.id, name: server.name })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { id } = await params
  await prisma.bbbServer.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
