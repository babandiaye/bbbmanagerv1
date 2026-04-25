import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { getSiteInfo, getCoursesByField, getBBBActivitiesByCourses } from '@/lib/moodle'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

/**
 * Auto-détection du bbb-origin-server-name pour une plateforme Moodle.
 * Stratégie : on prend une activité BBB de la plateforme, on cherche en base
 * un recording avec ce préfixe meetingId, on lit le metadata.
 * Best effort : retourne null si pas de recording matchant trouvé.
 */
async function detectBbbOriginServerName(url: string, token: string): Promise<string | null> {
  try {
    const courses = await getCoursesByField(url, token, 'shortname' as any, '')
      .catch(() => [])
    let allCourses = courses
    if (allCourses.length === 0) {
      // Fallback : récupérer tous les cours visibles
      const fallback = await getCoursesByField(url, token, 'id' as any, 1).catch(() => [])
      allCourses = fallback
    }
    if (allCourses.length === 0) {
      // Dernier recours : core_course_get_courses_by_field sans value
      const all = await import('@/lib/moodle').then(m => m.moodleCall(url, token, 'core_course_get_courses_by_field', {}).catch(() => null))
      allCourses = (all as any)?.courses ?? []
    }
    if (allCourses.length === 0) return null

    // Chercher la 1re activité BBB sur les premiers cours
    const courseIds = allCourses.slice(0, 20).map((c: any) => c.id)
    const activities = await getBBBActivitiesByCourses(url, token, courseIds).catch(() => [])
    if (activities.length === 0) return null

    for (const a of activities) {
      if (!a.meetingid) continue
      const rec = await prisma.recording.findFirst({
        where: { meetingId: { startsWith: a.meetingid } },
        select: { rawData: true },
      })
      const meta = (rec?.rawData as any)?.metadata
      const origin = meta?.['bbb-origin-server-name']
      if (typeof origin === 'string' && origin.length > 0) return origin
    }
    return null
  } catch {
    return null
  }
}

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const platforms = await prisma.moodlePlatform.findMany({
    orderBy: { createdAt: 'desc' },
  })

  // Ne jamais retourner le token en clair
  return NextResponse.json(
    platforms.map((p) => ({
      id:                  p.id,
      name:                p.name,
      url:                 p.url,
      serviceName:         p.serviceName,
      wsUsername:          p.wsUsername,
      siteName:            p.siteName,
      bbbOriginServerName: p.bbbOriginServerName,
      lastCheckAt:         p.lastCheckAt,
      isActive:            p.isActive,
      createdAt:           p.createdAt,
    })),
  )
}

export async function POST(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { name, url, token, serviceName, bbbOriginServerName } = await req.json()
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

  // Si l'admin n'a pas saisi bbbOriginServerName manuellement, on tente l'auto-détection
  let resolvedOrigin: string | null = bbbOriginServerName?.trim() || null
  let originAutoDetected = false
  if (!resolvedOrigin) {
    resolvedOrigin = await detectBbbOriginServerName(cleanUrl, token)
    originAutoDetected = !!resolvedOrigin
  }

  const platform = await prisma.moodlePlatform.create({
    data: {
      name,
      url:                 cleanUrl,
      tokenEnc:            encrypt(token),
      serviceName:         serviceName?.trim() || null,
      wsUsername:          siteInfo.username,
      siteName:            siteInfo.sitename,
      bbbOriginServerName: resolvedOrigin,
      lastCheckAt:         new Date(),
    },
  })

  logger.info(
    {
      userId: a.user.id, platformId: platform.id, name,
      sitename: siteInfo.sitename, wsUser: siteInfo.username,
      bbbOriginServerName: resolvedOrigin, originAutoDetected,
    },
    'Plateforme Moodle ajoutée',
  )

  return NextResponse.json(
    {
      id:       platform.id,
      name:     platform.name,
      url:      platform.url,
      sitename: siteInfo.sitename,
      wsUser:   siteInfo.fullname,
      bbbOriginServerName: resolvedOrigin,
      originAutoDetected,
    },
    { status: 201 },
  )
}
