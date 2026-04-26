import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { findRecordingById } from '@/lib/bbb'
import { fetchAndAnalyzeEvents, type EventsAnalysis } from '@/lib/bbb-raw'

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

  // 3. Étape 3 (déduction) : pour les IDs introuvables côté API BBB,
  //    on cherche en base BBB Manager un autre recording de la même "famille"
  //    (même préfixe sha1 du meetingId).
  //    Le recordID a la forme "<sha1>-<timestamp>". Le sha1 identifie l'activité BBB
  //    et tous les recordings d'une même activité partagent ce préfixe.
  type InferredHit = {
    server: { name: string; url: string }
    contextName?: string | null
    contextLabel?: string | null
    contextId?: string | null
    sampleRecordId?: string
    sampleStartTimeMs?: number
  }
  const inferredResults = new Map<string, InferredHit>()

  const stillMissingIds = missingIds.filter(id => !apiResults.has(id))
  if (stillMissingIds.length > 0) {
    // On extrait le préfixe sha1 (40 hex avant le '-') de chaque ID introuvable
    const sha1ByRecord = new Map<string, string>()
    for (const id of stillMissingIds) {
      const sha = id.split('-')[0]
      if (sha && sha.length === 40) sha1ByRecord.set(id, sha)
    }
    const uniquePrefixes = [...new Set(sha1ByRecord.values())]

    if (uniquePrefixes.length > 0) {
      // OR sur tous les préfixes en une seule requête Prisma
      const familyRecordings = await prisma.recording.findMany({
        where: {
          OR: uniquePrefixes.map(prefix => ({ meetingId: { startsWith: prefix } })),
        },
        select: {
          meetingId: true,
          recordId: true,
          startTime: true,
          rawData: true,
          server: { select: { name: true, url: true } },
        },
        take: 1000,
      })

      // Indexer par préfixe sha1 (premier enregistrement trouvé suffit)
      const byPrefix = new Map<string, InferredHit>()
      for (const f of familyRecordings) {
        const sha = f.meetingId.split('-')[0]
        if (!sha || byPrefix.has(sha)) continue
        const meta = (f.rawData as any)?.metadata ?? {}
        byPrefix.set(sha, {
          server: { name: f.server.name, url: f.server.url },
          contextName: meta['bbb-context-name'],
          contextLabel: meta['bbb-context-label'],
          contextId: meta['bbb-context-id'],
          sampleRecordId: f.recordId,
          sampleStartTimeMs: f.startTime.getTime(),
        })
      }

      for (const [recordId, sha] of sha1ByRecord) {
        const hit = byPrefix.get(sha)
        if (hit) inferredResults.set(recordId, hit)
      }
    }
  }

  // 4. Étape 4 (events.xml) : pour CHAQUE ID, on tente de fetch events.xml sur les
  //    serveurs ayant un rawIndexUrl configuré. Cela permet :
  //    - de trouver le serveur d'origine pour les IDs jamais vus par BBB (status=0)
  //    - d'obtenir les vraies métriques de la session (participants, chat, screen…)
  //    - de déterminer si l'enregistrement est rebuildable
  type RawHit = { server: { id: string; name: string; url: string }; analysis: EventsAnalysis }
  const rawResults = new Map<string, RawHit>()

  const allServers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { id: true, name: true, url: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })

  // Pré-déchiffrer les credentials une fois pour éviter de le faire dans la boucle
  const serverAuth = new Map<string, string | null>()
  for (const s of allServers) {
    if (s.rawIndexAuthEnc) {
      try { serverAuth.set(s.id, decrypt(s.rawIndexAuthEnc)) }
      catch { serverAuth.set(s.id, null) }
    } else {
      serverAuth.set(s.id, null)
    }
  }

  if (allServers.length > 0) {
    // Si on a déjà identifié le serveur via DB/API/inferred, on n'interroge QUE ce serveur.
    // Sinon on essaie tous les serveurs (cas des status=0 jamais traités).
    await Promise.all(cleanIds.map(async (recordId) => {
      const knownServerName =
        foundInDb.get(recordId)?.server.name ??
        apiResults.get(recordId)?.server.name ??
        inferredResults.get(recordId)?.server.name

      const candidates = knownServerName
        ? allServers.filter(s => s.name === knownServerName)
        : allServers

      for (const server of candidates) {
        if (!server.rawIndexUrl) continue
        const auth = serverAuth.get(server.id) ?? null
        const analysis = await fetchAndAnalyzeEvents(server.rawIndexUrl, recordId, auth)
        if (analysis && analysis.startTimeMs !== null) {
          rawResults.set(recordId, {
            server: { id: server.id, name: server.name, url: server.url },
            analysis,
          })
          return
        }
      }
    }))
  }

  // 5. Construire le résultat enrichi pour chaque ID
  type DiagnosisResult = {
    recordId: string
    found: boolean
    source: 'db' | 'bbb_api' | 'inferred' | 'raw' | 'not_found'
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
    // Analyse events.xml (présente si available)
    rawAnalysis?: {
      participantCount: number
      participantNames: string[]
      chatMessageCount: number
      hasScreenShare: boolean
      hasWebcam: boolean
      isRebuildable: boolean
      rebuildReasons: string[]
    }
  }

  const results: DiagnosisResult[] = cleanIds.map((recordId) => {
    const rawHit = rawResults.get(recordId)
    const rawAnalysis = rawHit
      ? {
          participantCount: rawHit.analysis.participantCount,
          participantNames: rawHit.analysis.participantNames,
          chatMessageCount: rawHit.analysis.chatMessageCount,
          hasScreenShare: rawHit.analysis.hasScreenShare,
          hasWebcam: rawHit.analysis.hasWebcam,
          isRebuildable: rawHit.analysis.isRebuildable,
          rebuildReasons: rawHit.analysis.rebuildReasons,
        }
      : undefined

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
        rawAnalysis,
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
        rawAnalysis,
      }
    }

    // Étape 4 : trouvé via events.xml (cas typique des status=0)
    if (rawHit) {
      const a = rawHit.analysis
      return {
        recordId,
        found: true,
        source: 'raw',
        server: { name: rawHit.server.name, url: rawHit.server.url },
        durationMin: a.durationSec !== null ? Math.round(a.durationSec / 60) : undefined,
        startTimeMs: a.startTimeMs ?? undefined,
        name: a.bbbRecordingName ?? a.meetingName,
        contextName: a.bbbContextName,
        contextLabel: a.bbbContextLabel,
        contextId: a.bbbContextId,
        rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
        message: a.isRebuildable
          ? `Trouvé via events.xml sur ${rawHit.server.name}. ${a.rebuildReasons.join(' · ')} → rebuildable.`
          : `Trouvé via events.xml sur ${rawHit.server.name} mais session vide (pas rebuildable) : ${a.participantCount} participant(s), ${a.chatMessageCount} message(s) chat.`,
        rawAnalysis,
      }
    }

    const inferred = inferredResults.get(recordId)
    if (inferred) {
      return {
        recordId,
        found: true,
        source: 'inferred',
        server: inferred.server,
        contextName: inferred.contextName ?? undefined,
        contextLabel: inferred.contextLabel ?? undefined,
        contextId: inferred.contextId ?? undefined,
        rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
        message: `Serveur déduit via la famille meetingId (${inferred.server.name}). events.xml indisponible — vérifier que le serveur a configuré l'index Nginx.`,
      }
    }

    return {
      recordId,
      found: false,
      source: 'not_found',
      rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
      message: 'Introuvable sur tous les serveurs BBB. Vérifier que le recordID est valide.',
    }
  })

  const summary = {
    total: cleanIds.length,
    inDb: results.filter(r => r.source === 'db').length,
    apiOnly: results.filter(r => r.source === 'bbb_api').length,
    raw: results.filter(r => r.source === 'raw').length,
    inferred: results.filter(r => r.source === 'inferred').length,
    notFound: results.filter(r => r.source === 'not_found').length,
    rebuildable: results.filter(r => r.rawAnalysis?.isRebuildable).length,
  }

  return NextResponse.json({ summary, results })
}
