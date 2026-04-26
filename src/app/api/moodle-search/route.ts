import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import {
  getCoursesByField,
  getBBBActivitiesByCourses,
  getCourseModule,
  getRecordingsForActivity,
  type MoodleCourse,
  type MoodleBBBActivity,
  type MoodleRecording,
} from '@/lib/moodle'
import {
  listRawDirectories,
  fetchAndAnalyzeEvents,
  type EventsAnalysis,
} from '@/lib/bbb-raw'

type SearchType = 'cmid' | 'recordId'

function validateInput(type: SearchType, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (type === 'cmid')     return /^\d{1,10}$/.test(v) ? v : null
  if (type === 'recordId') return /^[a-f0-9]{40}-\d{10,13}$/.test(v) ? v : null
  return null
}

type UnifiedRecording = {
  recordId: string
  startTimeMs: number | null
  durationMin: number | null
  participantCount?: number
  chatMessageCount?: number
  hasScreenShare?: boolean
  hasWebcam?: boolean
  publishedOnMoodle: boolean       // côté Moodle API
  publishedOnBbb: boolean          // côté BBB API ou base BBB Manager
  inRaw: boolean                   // fichiers raw présents
  isRebuildable: boolean           // critères : durée ≥ 15 min ET participants ≥ 2
  rebuildReasons: string[]
  server?: { name: string; url: string }
  bbbState?: string
  bbbRecordingDbId?: string
  rebuildCommand?: string
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const platformId = sp.get('platformId')
  const type = sp.get('type') as SearchType | null
  const rawValue = sp.get('value')

  if (!platformId || !type || !rawValue) {
    return NextResponse.json({ error: 'platformId, type et value requis' }, { status: 400 })
  }
  if (type !== 'cmid' && type !== 'recordId') {
    return NextResponse.json({ error: 'Type invalide. Valeurs : cmid, recordId' }, { status: 400 })
  }
  const value = validateInput(type, rawValue)
  if (!value) {
    return NextResponse.json({ error: `Format invalide pour le type "${type}"` }, { status: 400 })
  }

  const platform = await prisma.moodlePlatform.findUnique({ where: { id: platformId } })
  if (!platform) return NextResponse.json({ error: 'Plateforme introuvable' }, { status: 404 })
  if (!platform.isActive) return NextResponse.json({ error: 'Plateforme désactivée' }, { status: 400 })

  let token: string
  try {
    token = decrypt(platform.tokenEnc)
  } catch {
    return NextResponse.json({ error: 'Impossible de déchiffrer le token' }, { status: 500 })
  }

  // ─── Étape 1 : résoudre l'activité Moodle ───────────────────────────
  let courses: MoodleCourse[] = []
  let activities: MoodleBBBActivity[] = []
  let moodleRecordings: MoodleRecording[] = []
  let activityMeetingPrefix: string | null = null

  try {
    if (type === 'cmid') {
      const cm = await getCourseModule(platform.url, token, parseInt(value, 10))
      if (!cm) return NextResponse.json({ error: `Module ${value} introuvable sur Moodle` }, { status: 404 })
      if (cm.modname !== 'bigbluebuttonbn') {
        return NextResponse.json({ error: `Le module ${value} n'est pas une activité BBB (type: ${cm.modname})` }, { status: 400 })
      }

      courses = await getCoursesByField(platform.url, token, 'id', cm.course)

      const allCourseActivities = await getBBBActivitiesByCourses(platform.url, token, [cm.course])
      const matched = allCourseActivities.find(a => a.id === cm.instance)
      activities = matched
        ? [matched]
        : [{ id: cm.instance, course: cm.course, name: cm.name, meetingid: '', coursemodule: cm.id }]

      activityMeetingPrefix = matched?.meetingid ?? null
      moodleRecordings = await getRecordingsForActivity(platform.url, token, cm.instance)
    }
    // type === 'recordId' : pas de scan d'activité, on cherche juste l'enregistrement
  } catch (err: any) {
    return NextResponse.json({ error: `Erreur Moodle : ${err.message}` }, { status: 400 })
  }

  // ─── Étape 2 : recherche en base BBB Manager ────────────────────────
  let bbbRecordings: any[] = []
  if (type === 'recordId') {
    bbbRecordings = await prisma.recording.findMany({
      where: { recordId: value },
      include: { server: { select: { name: true, url: true } } },
    })
  } else if (activityMeetingPrefix) {
    bbbRecordings = await prisma.recording.findMany({
      where: {
        meetingId: { startsWith: activityMeetingPrefix },
        rawData: { path: ['metadata', 'bbb-origin-server-name'], equals: platform.bbbOriginServerName ?? undefined },
      },
      include: { server: { select: { name: true, url: true } } },
      orderBy: { startTime: 'desc' },
    })
  }

  // ─── Étape 3 : scan du raw sur tous les serveurs configurés ─────────
  // Pour chaque serveur ayant un rawIndexUrl, on liste les recordIDs et on filtre
  // par le préfixe SHA1 de l'activité Moodle.
  type RawHit = {
    recordId: string
    server: { id: string; name: string; url: string }
    mtimeMs: number
    analysis?: EventsAnalysis
  }
  const rawHits: RawHit[] = []

  if (activityMeetingPrefix || type === 'recordId') {
    const allServers = await prisma.bbbServer.findMany({
      where: { isActive: true, rawIndexUrl: { not: null } },
      select: { id: true, name: true, url: true, rawIndexUrl: true, rawIndexAuthEnc: true },
    })

    // Décrypter les credentials une fois
    const serverAuth = new Map<string, string | null>()
    for (const s of allServers) {
      if (s.rawIndexAuthEnc) {
        try { serverAuth.set(s.id, decrypt(s.rawIndexAuthEnc)) }
        catch { serverAuth.set(s.id, null) }
      } else {
        serverAuth.set(s.id, null)
      }
    }

    // Collecter les hits raw en parallèle sur tous les serveurs
    const perServerHits = await Promise.all(allServers.map(async (server) => {
      if (!server.rawIndexUrl) return []
      const auth = serverAuth.get(server.id) ?? null
      const prefix = type === 'recordId' ? value : (activityMeetingPrefix ?? '')
      const dirs = await listRawDirectories(server.rawIndexUrl, auth, prefix)
      // Pour le mode recordId, ne garder que le match exact (le préfixe peut matcher
      // d'autres recordings de la même activité)
      const filtered = type === 'recordId' ? dirs.filter(d => d.recordId === value) : dirs
      return filtered.map(d => ({
        recordId: d.recordId,
        server: { id: server.id, name: server.name, url: server.url },
        mtimeMs: d.mtimeMs,
      }))
    }))
    const allHits = perServerHits.flat()

    // Pour chaque hit raw, fetch events.xml en parallèle (groupé par serveur pour passer la bonne auth)
    await Promise.all(allHits.map(async (hit) => {
      const server = allServers.find(s => s.id === hit.server.id)
      if (!server?.rawIndexUrl) return
      const auth = serverAuth.get(hit.server.id) ?? null
      const analysis = await fetchAndAnalyzeEvents(server.rawIndexUrl, hit.recordId, auth)
      if (analysis) {
        rawHits.push({ ...hit, analysis })
      } else {
        rawHits.push(hit)
      }
    }))
  }

  // ─── Étape 4 : croiser les 3 sources ────────────────────────────────
  // Index par recordId
  const rawByRecord = new Map(rawHits.map(h => [h.recordId, h]))
  const bbbByRecord = new Map(bbbRecordings.map(r => [r.recordId, r]))
  const moodleByRecord = new Map(
    moodleRecordings.filter(r => r.recordId).map(r => [r.recordId!, r]),
  )

  const allRecordIds = new Set<string>([
    ...rawByRecord.keys(),
    ...bbbByRecord.keys(),
    ...moodleByRecord.keys(),
  ])

  const unified: UnifiedRecording[] = []
  for (const recordId of allRecordIds) {
    const raw = rawByRecord.get(recordId)
    const bbb = bbbByRecord.get(recordId)
    const moodle = moodleByRecord.get(recordId)
    const a = raw?.analysis

    const startTimeMs =
      a?.startTimeMs ??
      moodle?.startTimeMs ??
      (bbb ? bbb.startTime.getTime() : null) ??
      raw?.mtimeMs ??
      null
    const durationMin =
      a?.durationSec != null ? Math.round(a.durationSec / 60) :
      moodle?.durationMin ??
      (bbb ? Math.round(bbb.durationSec / 60) : null)

    const publishedOnMoodle = moodle?.publishedOnMoodle ?? false
    const publishedOnBbb = bbb?.published === true
    const inRaw = !!raw

    unified.push({
      recordId,
      startTimeMs,
      durationMin,
      participantCount: a?.participantCount,
      chatMessageCount: a?.chatMessageCount,
      hasScreenShare: a?.hasScreenShare,
      hasWebcam: a?.hasWebcam,
      publishedOnMoodle,
      publishedOnBbb,
      inRaw,
      isRebuildable: a?.isRebuildable ?? false,
      rebuildReasons: a?.rebuildReasons ?? [],
      server: raw?.server ?? (bbb ? { name: bbb.server.name, url: bbb.server.url } : undefined),
      bbbState: bbb?.state,
      bbbRecordingDbId: bbb?.id,
      rebuildCommand: `sudo bbb-record --rebuild ${recordId}`,
    })
  }

  // Tri : non publiés en premier (à traiter), puis date desc
  unified.sort((a, b) => {
    const aPriority = !a.publishedOnMoodle && !a.publishedOnBbb && a.inRaw ? 0 : 1
    const bPriority = !b.publishedOnMoodle && !b.publishedOnBbb && b.inRaw ? 0 : 1
    if (aPriority !== bPriority) return aPriority - bPriority
    return (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0)
  })

  const summary = {
    total: unified.length,
    publishedBoth: unified.filter(r => r.publishedOnMoodle && r.publishedOnBbb).length,
    onlyRaw: unified.filter(r => r.inRaw && !r.publishedOnMoodle && !r.publishedOnBbb).length,
    rebuildable: unified.filter(r => r.isRebuildable).length,
    rawMissing: unified.filter(r => !r.inRaw).length,
  }

  return NextResponse.json({
    platform: {
      id: platform.id,
      name: platform.name,
      siteName: platform.siteName,
      url: platform.url,
      bbbOriginServerName: platform.bbbOriginServerName,
    },
    input: { type, value },
    courses,
    activities,
    activityMeetingPrefix,
    recordings: unified,
    summary,
    warning: !platform.bbbOriginServerName && type !== 'recordId'
      ? 'Le filtre par plateforme n\'est pas configuré (bbb-origin-server-name manquant). Risque de fuite entre plateformes Moodle.'
      : undefined,
  })
}
