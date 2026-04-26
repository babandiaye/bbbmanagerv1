import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import {
  RAW_DEFAULT_VIEW_DAYS,
  MIN_RECORDING_DURATION_SEC,
  MIN_PARTICIPANTS_FOR_REBUILD,
} from '@/lib/constants'
import { getLastRawScanResult } from '@/lib/cron'

/**
 * GET /api/rebuildable-orphans
 * Query params :
 *   - days       : fenetre date (defaut 30, valeurs typiques 7/30/60/all)
 *   - platform   : filtre par bbb-origin-server-name (cad par plateforme Moodle)
 *
 * Retourne :
 *   - count       : total des orphelins rebuildables sur la fenetre
 *   - byServer    : groupage par serveur avec liste des recordings
 *   - platforms   : liste des plateformes detectees (pour le selecteur UI)
 *   - lastScan    : metadata du dernier scan
 */
export async function GET(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const sp = req.nextUrl.searchParams
  const daysParam = sp.get('days') ?? String(RAW_DEFAULT_VIEW_DAYS)
  const platform = sp.get('platform') ?? undefined

  let cutoffMs: number | null = null
  if (daysParam !== 'all') {
    const days = parseInt(daysParam, 10)
    if (Number.isFinite(days) && days > 0) {
      cutoffMs = Date.now() - days * 86_400_000
    }
  }

  // Critères évalués dynamiquement (durée + participants), pas via le booléen stocké.
  // Évite d'avoir à re-scanner quand on ajuste les seuils dans constants.ts.
  const where: any = {
    durationSec: { gte: MIN_RECORDING_DURATION_SEC },
    participantCount: { gte: MIN_PARTICIPANTS_FOR_REBUILD },
    publishedInDb: false,
  }
  if (cutoffMs !== null) where.startTimeMs = { gte: BigInt(cutoffMs) }
  if (platform) where.bbbOriginServerName = platform

  const rows = await prisma.rawDiscovery.findMany({
    where,
    orderBy: { startTimeMs: 'desc' },
    include: { server: { select: { id: true, name: true, url: true } } },
  })

  // Liste de toutes les plateformes detectees (sans le filtre platform)
  const wherePlatforms: any = {
    durationSec: { gte: MIN_RECORDING_DURATION_SEC },
    participantCount: { gte: MIN_PARTICIPANTS_FOR_REBUILD },
    publishedInDb: false,
  }
  if (cutoffMs !== null) wherePlatforms.startTimeMs = { gte: BigInt(cutoffMs) }
  const platformGroups = await prisma.rawDiscovery.groupBy({
    by: ['bbbOriginServerName'],
    where: wherePlatforms,
    _count: { _all: true },
  })

  // Groupage par serveur pour l'UI
  const byServer = new Map<string, { id: string; name: string; url: string; items: any[] }>()
  for (const r of rows) {
    const key = r.serverId
    if (!byServer.has(key)) {
      byServer.set(key, { id: r.server.id, name: r.server.name, url: r.server.url, items: [] })
    }
    byServer.get(key)!.items.push({
      recordId: r.recordId,
      startTimeMs: r.startTimeMs ? Number(r.startTimeMs) : null,
      durationSec: r.durationSec,
      participantCount: r.participantCount,
      chatMessageCount: r.chatMessageCount,
      hasScreenShare: r.hasScreenShare,
      hasWebcam: r.hasWebcam,
      bbbOriginServerName: r.bbbOriginServerName,
      bbbContextName: r.bbbContextName,
      bbbContextLabel: r.bbbContextLabel,
      rebuildCommand: `sudo bbb-record --rebuild ${r.recordId}`,
    })
  }

  const lastScan = await getLastRawScanResult()

  return NextResponse.json({
    count: rows.length,
    days: daysParam,
    platform: platform ?? null,
    byServer: [...byServer.values()].sort((a, b) => b.items.length - a.items.length),
    platforms: platformGroups
      .filter(g => g.bbbOriginServerName)
      .map(g => ({ name: g.bbbOriginServerName!, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    lastScan,
  })
}
