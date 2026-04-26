import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { fetchAndAnalyzeEvents, listRawDirectories } from '@/lib/bbb-raw'
import { RAW_SCAN_WINDOW_DAYS, RAW_SCAN_CONCURRENCY } from '@/lib/constants'

export type RawScanResult = {
  serversProcessed: number
  dirsListed: number
  inWindow: number
  fetched: number
  inserted: number
  updated: number
  purged: number
  errors: string[]
  durationMs: number
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Scan complet de l'autoindex de tous les serveurs actifs avec rawIndexUrl.
 * - Ne fetch events.xml que pour les dossiers dont mtime >= now - RAW_SCAN_WINDOW_DAYS
 * - Upsert dans raw_discoveries
 * - Cross-check avec Recording.published
 * - Purge les entrees dont le dossier a disparu de l'autoindex
 */
export async function scanRawDiscoveries(): Promise<RawScanResult> {
  const startedAt = Date.now()
  const result: RawScanResult = {
    serversProcessed: 0,
    dirsListed: 0,
    inWindow: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    purged: 0,
    errors: [],
    durationMs: 0,
  }

  const servers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { id: true, name: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })

  const cutoffMs = Date.now() - RAW_SCAN_WINDOW_DAYS * 86_400_000

  for (const server of servers) {
    if (!server.rawIndexUrl) continue
    let auth: string | null = null
    if (server.rawIndexAuthEnc) {
      try { auth = decrypt(server.rawIndexAuthEnc) } catch {}
    }

    let dirs: { recordId: string; mtimeMs: number }[]
    try {
      dirs = await listRawDirectories(server.rawIndexUrl, auth)
    } catch (err: any) {
      result.errors.push(`${server.name}: list ${err.message}`)
      continue
    }
    result.serversProcessed++
    result.dirsListed += dirs.length

    const allRecordIdsOnServer = new Set(dirs.map(d => d.recordId))

    const recent = dirs.filter(d => d.mtimeMs >= cutoffMs)
    result.inWindow += recent.length

    const existing = await prisma.rawDiscovery.findMany({
      where: { serverId: server.id },
      select: { recordId: true, rawMtimeMs: true },
    })
    const existingMap = new Map(existing.map(e => [e.recordId, e.rawMtimeMs ? Number(e.rawMtimeMs) : null]))

    const toFetch = recent.filter(d => {
      const prev = existingMap.get(d.recordId)
      return prev === undefined || prev !== d.mtimeMs
    })

    await runWithConcurrency(toFetch, RAW_SCAN_CONCURRENCY, async (d) => {
      try {
        const a = await fetchAndAnalyzeEvents(server.rawIndexUrl!, d.recordId, auth)
        result.fetched++

        const rec = await prisma.recording.findUnique({
          where: { recordId: d.recordId },
          select: { published: true },
        })

        const data = {
          serverId: server.id,
          recordId: d.recordId,
          startTimeMs: a?.startTimeMs ? BigInt(a.startTimeMs) : null,
          durationSec: a?.durationSec ?? null,
          participantCount: a?.participantCount ?? 0,
          chatMessageCount: a?.chatMessageCount ?? 0,
          hasScreenShare: a?.hasScreenShare ?? false,
          hasWebcam: a?.hasWebcam ?? false,
          bbbOriginServerName: a?.bbbOriginServerName ?? null,
          bbbContextName: a?.bbbContextName ?? null,
          bbbContextLabel: a?.bbbContextLabel ?? null,
          isRebuildable: a?.isRebuildable ?? false,
          publishedInDb: rec?.published ?? false,
          rawMtimeMs: BigInt(d.mtimeMs),
          scannedAt: new Date(),
        }

        const wasNew = existingMap.get(d.recordId) === undefined
        await prisma.rawDiscovery.upsert({
          where: { recordId_serverId: { recordId: d.recordId, serverId: server.id } },
          create: data,
          update: data,
        })
        if (wasNew) result.inserted++
        else result.updated++
      } catch (err: any) {
        result.errors.push(`${server.name}/${d.recordId}: ${err.message}`)
      }
    })

    // Purge : entries dont le dossier raw a disparu (cleanup BBB)
    const toPurge = [...existingMap.keys()].filter(id => !allRecordIdsOnServer.has(id))
    if (toPurge.length > 0) {
      const del = await prisma.rawDiscovery.deleteMany({
        where: { serverId: server.id, recordId: { in: toPurge } },
      })
      result.purged += del.count
    }

    // Refresh publishedInDb pour les entrees deja en base (sans refetch events.xml)
    const notRefetchedIds = recent
      .filter(d => !toFetch.find(t => t.recordId === d.recordId))
      .map(d => d.recordId)
    if (notRefetchedIds.length > 0) {
      const recs = await prisma.recording.findMany({
        where: { recordId: { in: notRefetchedIds } },
        select: { recordId: true, published: true },
      })
      const publishedMap = new Map(recs.map(r => [r.recordId, r.published]))
      for (const id of notRefetchedIds) {
        const newPub = publishedMap.get(id) ?? false
        await prisma.rawDiscovery.updateMany({
          where: { serverId: server.id, recordId: id, publishedInDb: { not: newPub } },
          data: { publishedInDb: newPub, scannedAt: new Date() },
        })
      }
    }
  }

  result.durationMs = Date.now() - startedAt
  logger.info(result, 'Raw scan termine')
  return result
}
