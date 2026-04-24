import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { getSiteInfo } from '@/lib/moodle'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const platforms = await prisma.moodlePlatform.findMany({
    orderBy: { createdAt: 'desc' },
  })

  // Ne jamais retourner le token en clair
  return NextResponse.json(
    platforms.map((p) => ({
      id:          p.id,
      name:        p.name,
      url:         p.url,
      serviceName: p.serviceName,
      wsUsername:  p.wsUsername,
      siteName:    p.siteName,
      lastCheckAt: p.lastCheckAt,
      isActive:    p.isActive,
      createdAt:   p.createdAt,
    })),
  )
}

export async function POST(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { name, url, token, serviceName } = await req.json()
  if (!name || !url || !token) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  // Valider le format de l'URL
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'L\'URL doit utiliser http ou https' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Format d\'URL invalide' }, { status: 400 })
  }

  const cleanUrl = url.replace(/\/+$/, '')

  // Tester la connexion + valider le token via core_webservice_get_site_info
  let siteInfo
  try {
    siteInfo = await getSiteInfo(cleanUrl, token)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Impossible de contacter Moodle : ${err.message}` },
      { status: 400 },
    )
  }

  const platform = await prisma.moodlePlatform.create({
    data: {
      name,
      url:         cleanUrl,
      tokenEnc:    encrypt(token),
      serviceName: serviceName?.trim() || null,
      wsUsername:  siteInfo.username,
      siteName:    siteInfo.sitename,
      lastCheckAt: new Date(),
    },
  })

  logger.info(
    { userId: a.user.id, platformId: platform.id, name, sitename: siteInfo.sitename, wsUser: siteInfo.username },
    'Plateforme Moodle ajoutée',
  )

  return NextResponse.json(
    {
      id:       platform.id,
      name:     platform.name,
      url:      platform.url,
      sitename: siteInfo.sitename,
      wsUser:   siteInfo.fullname,
    },
    { status: 201 },
  )
}
