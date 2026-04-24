import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { getSiteInfo } from '@/lib/moodle'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { id } = await params
  const { name, url, token, isActive, serviceName } = await req.json()

  const data: Record<string, unknown> = {}
  if (name)                      data.name = name
  if (url)                       data.url  = url.replace(/\/+$/, '')
  if (serviceName !== undefined) data.serviceName = serviceName?.trim() || null
  if (isActive !== undefined)    data.isActive = isActive

  // Si le token change, on re-valide la connexion et on refresh siteName/wsUsername
  if (token) {
    const targetUrl = (data.url as string) ?? (await prisma.moodlePlatform.findUnique({
      where: { id },
      select: { url: true },
    }))?.url
    if (!targetUrl) {
      return NextResponse.json({ error: 'Plateforme introuvable' }, { status: 404 })
    }
    try {
      const siteInfo = await getSiteInfo(targetUrl, token)
      data.tokenEnc    = encrypt(token)
      data.wsUsername  = siteInfo.username
      data.siteName    = siteInfo.sitename
      data.lastCheckAt = new Date()
    } catch (err: any) {
      return NextResponse.json(
        { error: `Impossible de contacter Moodle : ${err.message}` },
        { status: 400 },
      )
    }
  }

  const platform = await prisma.moodlePlatform.update({
    where: { id },
    data,
  })

  logger.info(
    { userId: a.user.id, platformId: id, fields: Object.keys(data) },
    'Plateforme Moodle modifiée',
  )

  return NextResponse.json({ id: platform.id, name: platform.name })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { id } = await params

  const platform = await prisma.moodlePlatform.findUnique({ where: { id } })
  if (!platform) {
    return NextResponse.json({ error: 'Plateforme introuvable' }, { status: 404 })
  }

  await prisma.moodlePlatform.delete({ where: { id } })

  logger.warn(
    { userId: a.user.id, platformId: id, name: platform.name },
    'Plateforme Moodle supprimée',
  )

  return NextResponse.json({ success: true, name: platform.name })
}
