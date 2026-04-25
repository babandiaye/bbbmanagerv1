import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { findRecordingById } from '@/lib/bbb'

/**
 * POST /api/diagnose-batch
 * Body: { recordIds: string[] }
 *
 * Diagnostic d'une liste de record IDs BBB :
 *   1. Cherche chaque ID en base BBB Manager (rapide)
 *   2. Pour les IDs absents : interroge tous les serveurs BBB actifs (parallèle)
 *      pour identifier celui qui héberge l'enregistrement.
 *   3. Retourne pour chaque ID :
 *      - le serveur BBB d'origine (si trouvé)
 *      - l'état BBB actuel
 *      - les infos contextuelles (cours Moodle, durée, date)
 *      - la commande SSH `bbb-record --rebuild` à exécuter
 *
 * AUCUNE action n'est effectuée (pas de publication, pas de SSH).
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { recordIds } = await req.json()
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds requis (tableau non vide)' }, { status: 400 })
  }
  if (recordIds.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 IDs par requête' }, { status: 400 })
  }

  // Validation stricte du format des record IDs
  const validIdPattern = /^[a-f0-9]{40}-\d{10,13}$/
  const cleanIds = [...new Set(
    recordIds.map((id: string) => id.trim()).filter(Boolean),
  )]
  const invalidIds = cleanIds.filter(id => !validIdPattern.test(id))
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Format invalide pour ${invalidIds.length} ID(s). Attendu : 40 chars hex + tiret + timestamp.`, invalidIds },
      { status: 400 },
    )
  }

  // 1. Recherche en base BBB Manager pour tous les IDs
  const bbbRecordings = await prisma.recording.findMany({
    where: { recordId: { in: cleanIds } },
    include: { server: { select: { name: true, url: true } } },
  })
  const foundInDb = new Map(bbbRecordings.map(r => [r.recordId, r]))

  // 2. Pour les IDs non trouvés en base, interroger tous les serveurs BBB actifs
  const missingIds = cleanIds.filter(id => !foundInDb.has(id))
  const apiResults = new Map<string, { server: { id: string; name: string; url: string }; recording: any }>()

  if (missingIds.length > 0) {
    const servers = await prisma.bbbServer.findMany({ where: { isActive: true } })

    // Pour chaque ID manquant, on interroge en parallèle tous les serveurs
    // jusqu'à trouver lequel le possède.
    await Promise.all(missingIds.map(async (recordId) => {
      for (const server of servers) {
        try {
          const secret = decrypt(server.secretEnc)
          const found = await findRecordingById(server.url, secret, recordId)
          if (found && found.recordID === recordId) {
            apiResults.set(recordId, {
              server: { id: server.id, name: server.name, url: server.url },
              recording: found,
            })
            return // dès qu'on trouve, on arrête pour cet ID
          }
        } catch {
          // ignorer les serveurs en erreur
        }
      }
    }))
  }

  // 3. Construire le résultat enrichi pour chaque ID
  type DiagnosisResult = {
    recordId: string
    found: boolean
    source: 'db' | 'bbb_api' | 'not_found'
    server?: { name: string; url: string }
    state?: string
    published?: boolean
    durationMin?: number
    startTimeMs?: number
    name?: string
    contextName?: string
    contextLabel?: string
    contextId?: string
    rebuildCommand?: string
    bbbRecordingDbId?: string
    message?: string
  }

  const results: DiagnosisResult[] = cleanIds.map((recordId) => {
    const dbRec = foundInDb.get(recordId)
    if (dbRec) {
      const meta = (dbRec.rawData as any)?.metadata ?? {}
      return {
        recordId,
        found: true,
        source: 'db',
        server: { name: dbRec.server.name, url: dbRec.server.url },
        state: dbRec.state,
        published: dbRec.published,
        durationMin: Math.round(dbRec.durationSec / 60),
        startTimeMs: dbRec.startTime.getTime(),
        name: dbRec.name,
        contextName: meta['bbb-context-name'] ?? undefined,
        contextLabel: meta['bbb-context-label'] ?? undefined,
        contextId: meta['bbb-context-id'] ?? undefined,
        rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
        bbbRecordingDbId: dbRec.id,
      }
    }

    const apiRes = apiResults.get(recordId)
    if (apiRes) {
      const r = apiRes.recording
      const meta = r.metadata ?? {}
      return {
        recordId,
        found: true,
        source: 'bbb_api',
        server: { name: apiRes.server.name, url: apiRes.server.url },
        state: r.state,
        published: r.published === 'true',
        durationMin: r.playback?.format?.length ? parseInt(r.playback.format.length, 10) : undefined,
        startTimeMs: r.startTime ? parseInt(r.startTime, 10) : undefined,
        name: r.name ?? meta['bbb-recording-name'],
        contextName: meta['bbb-context-name'] ?? undefined,
        contextLabel: meta['bbb-context-label'] ?? undefined,
        contextId: meta['bbb-context-id'] ?? undefined,
        rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
        message: 'Trouvé via API BBB (pas encore en base BBB Manager — relancer une sync)',
      }
    }

    return {
      recordId,
      found: false,
      source: 'not_found',
      rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
      message: 'Introuvable sur tous les serveurs BBB actifs. L\'enregistrement n\'a peut-être jamais été traité par BBB (status=0 côté Moodle).',
    }
  })

  const summary = {
    total: cleanIds.length,
    inDb: results.filter(r => r.source === 'db').length,
    apiOnly: results.filter(r => r.source === 'bbb_api').length,
    notFound: results.filter(r => r.source === 'not_found').length,
  }

  return NextResponse.json({ summary, results })
}
