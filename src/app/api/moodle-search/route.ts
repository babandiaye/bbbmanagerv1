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

type SearchType = 'cmid' | 'recordId'

function validateInput(type: SearchType, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (type === 'cmid')     return /^\d{1,10}$/.test(v) ? v : null
  if (type === 'recordId') return /^[a-f0-9]{40}-\d{10,13}$/.test(v) ? v : null
  return null
}

type EnrichedRecording = {
  recordId: string
  name: string
  startTimeMs: number | null
  durationMin: number | null
  source: 'moodle_only' | 'bbb_only' | 'both'
  moodle?: {
    moodleId: string
    publishedOnMoodle: boolean
    imported: boolean
    playbackUrls: string[]
  }
  bbb?: {
    id: string
    state: string
    published: boolean
    durationSec: number
    startTime: string
    playbackUrl: string | null
    serverName: string
    serverUrl: string
  }
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

  let courses: MoodleCourse[] = []
  let activities: MoodleBBBActivity[] = []
  let moodleRecordings: MoodleRecording[] = []

  try {
    if (type === 'cmid') {
      // 1) Résoudre le cmid → course module
      const cm = await getCourseModule(platform.url, token, parseInt(value, 10))
      if (!cm) {
        return NextResponse.json({ error: `Module ${value} introuvable sur Moodle` }, { status: 404 })
      }
      if (cm.modname !== 'bigbluebuttonbn') {
        return NextResponse.json(
          { error: `Le module ${value} n'est pas une activité BigBlueButton (type: ${cm.modname})` },
          { status: 400 },
        )
      }

      // 2) Récupérer le cours pour affichage
      courses = await getCoursesByField(platform.url, token, 'id', cm.course)

      // 3) Récupérer l'activité BBB AVEC son vrai meetingid (essentiel pour le filtre précis)
      const allCourseActivities = await getBBBActivitiesByCourses(platform.url, token, [cm.course])
      const matched = allCourseActivities.find(a => a.id === cm.instance)
      activities = matched
        ? [matched]
        : [{ id: cm.instance, course: cm.course, name: cm.name, meetingid: '', coursemodule: cm.id }]

      // 4) Recordings vus par Moodle pour cette activité
      moodleRecordings = await getRecordingsForActivity(platform.url, token, cm.instance)
    }
    // type === 'recordId' : pas d'appel Moodle nécessaire, on cherche en base
  } catch (err: any) {
    return NextResponse.json({ error: `Erreur Moodle : ${err.message}` }, { status: 400 })
  }

  // ─── Recherche en base BBB Manager ──────────────────────────────────
  const meetingIdPrefixes = activities.map(a => a.meetingid).filter(Boolean)
  const moodleRecordIds = moodleRecordings.map(r => r.recordId).filter((x): x is string => !!x)

  const orConditions: any[] = []
  if (type === 'recordId') {
    orConditions.push({ recordId: value })
  } else {
    // Filtres précis (préfixe meetingId + recordIds vus par Moodle).
    // Le préfixe meetingId peut entrer en collision entre plateformes Moodle
    // → on filtre EN PLUS par bbb-origin-server-name si la plateforme l'a configuré.
    for (const m of meetingIdPrefixes) orConditions.push({ meetingId: { startsWith: m } })
    for (const rid of moodleRecordIds) orConditions.push({ recordId: rid })
  }

  // Filtre AND par bbb-origin-server-name pour éviter les fuites entre plateformes.
  // Si la plateforme n'a pas encore cette valeur configurée, on n'applique pas le filtre
  // (compromis : risque de collision, mais on retourne quand même un résultat).
  const baseWhere: any = orConditions.length === 0 ? null : { OR: orConditions }
  if (baseWhere && type !== 'recordId' && platform.bbbOriginServerName) {
    baseWhere.AND = [
      {
        rawData: {
          path: ['metadata', 'bbb-origin-server-name'],
          equals: platform.bbbOriginServerName,
        },
      },
    ]
  }

  const bbbRecordings = baseWhere === null ? [] : await prisma.recording.findMany({
    where: baseWhere,
    include: { server: { select: { name: true, url: true } } },
    orderBy: { startTime: 'desc' },
    take: 500,
  })

  // ─── Croisement Moodle ↔ BBB Manager ────────────────────────────────
  const bbbByRecordId = new Map(bbbRecordings.map(r => [r.recordId, r]))
  const moodleByRecordId = new Map(
    moodleRecordings.filter(r => r.recordId).map(r => [r.recordId!, r]),
  )
  const allRecordIds = new Set<string>([...moodleByRecordId.keys(), ...bbbByRecordId.keys()])

  // Serveur BBB le plus probable (utile pour les orphelins Moodle)
  const serverCount = new Map<string, { url: string; name: string; count: number }>()
  for (const r of bbbRecordings) {
    const k = r.server.name
    const e = serverCount.get(k)
    if (e) e.count++
    else serverCount.set(k, { url: r.server.url, name: r.server.name, count: 1 })
  }
  const probableServer = [...serverCount.values()].sort((a, b) => b.count - a.count)[0]

  const enriched: EnrichedRecording[] = []
  for (const recordId of allRecordIds) {
    const m = moodleByRecordId.get(recordId)
    const b = bbbByRecordId.get(recordId)
    let source: EnrichedRecording['source']
    if (m && b) source = 'both'
    else if (m && !b) source = 'moodle_only'
    else source = 'bbb_only'

    enriched.push({
      recordId,
      name: m?.name ?? b?.name ?? '',
      startTimeMs: m?.startTimeMs ?? (b ? new Date(b.startTime).getTime() : null),
      durationMin: m?.durationMin ?? (b ? Math.round(b.durationSec / 60) : null),
      source,
      moodle: m ? {
        moodleId: m.moodleId,
        publishedOnMoodle: m.publishedOnMoodle,
        imported: m.imported,
        playbackUrls: m.playbackUrls,
      } : undefined,
      bbb: b ? {
        id: b.id,
        state: b.state,
        published: b.published,
        durationSec: b.durationSec,
        startTime: b.startTime.toISOString(),
        playbackUrl: b.playbackUrl,
        serverName: b.server.name,
        serverUrl: b.server.url,
      } : undefined,
      rebuildCommand: source === 'moodle_only' ? `sudo bbb-record --rebuild ${recordId}` : undefined,
    })
  }

  enriched.sort((a, b) => {
    if (a.source === 'moodle_only' && b.source !== 'moodle_only') return -1
    if (a.source !== 'moodle_only' && b.source === 'moodle_only') return 1
    return (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0)
  })

  const summary = {
    total: enriched.length,
    synced: enriched.filter(r => r.source === 'both').length,
    moodleOnly: enriched.filter(r => r.source === 'moodle_only').length,
    bbbOnly: enriched.filter(r => r.source === 'bbb_only').length,
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
    probableServer: probableServer ? { name: probableServer.name, url: probableServer.url } : null,
    recordings: enriched,
    summary,
    warning: !platform.bbbOriginServerName && type !== 'recordId'
      ? 'Le filtre par plateforme n\'est pas configuré (bbb-origin-server-name manquant). Risque de fuite entre plateformes Moodle. Modifier la plateforme pour le définir.'
      : undefined,
  })
}
