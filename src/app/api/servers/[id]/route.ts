import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

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

  logger.info({ userId: a.user.id, serverId: id, fields: Object.keys(data) }, 'Serveur BBB modifié')

  return NextResponse.json({ id: server.id, name: server.name })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { id } = await params

  const server = await prisma.bbbServer.findUnique({
    where: { id },
    include: { _count: { select: { recordings: true, rebuildJobs: true } } },
  })

  if (!server) {
    return NextResponse.json({ error: 'Serveur introuvable' }, { status: 404 })
  }

  try {
    // La cascade supprime automatiquement les recordings et rebuild_jobs liés
    await prisma.bbbServer.delete({ where: { id } })

    logger.warn(
      {
        userId: a.user.id,
        serverId: id,
        name: server.name,
        recordingsDeleted: server._count.recordings,
        jobsDeleted: server._count.rebuildJobs,
      },
      'Serveur BBB supprimé (action critique)'
    )

    return NextResponse.json({
      success: true,
      name: server.name,
      recordingsDeleted: server._count.recordings,
      jobsDeleted: server._count.rebuildJobs,
    })
  } catch (err: any) {
    logger.error({ err: err.message, serverId: id }, 'Échec suppression serveur')
    return NextResponse.json(
      { error: `Suppression impossible : ${err.message}` },
      { status: 500 }
    )
  }
}
