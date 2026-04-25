import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import {
  getCoursesByField,
  getBBBActivitiesByCourses,
  getCourseModule,
  getRecordingsForActivity,
  getAllBBBActivities,
  type MoodleCourse,
  type MoodleBBBActivity,
  type MoodleRecording,
} from '@/lib/moodle'

type SearchType = 'cmid' | 'recordId' | 'activityName' | 'shortname'

/** Validation stricte de l'input selon le type. Renvoie null si invalide. */
function validateInput(type: SearchType, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null

  switch (type) {
    case 'cmid':
      // Numérique uniquement, max 10 chiffres
      return /^\d{1,10}$/.test(v) ? v : null

    case 'recordId':
      // SHA1 hex (40 chars) + '-' + timestamp (10-13 chiffres)
      return /^[a-f0-9]{40}-\d{10,13}$/.test(v) ? v : null

    case 'shortname':
      // Alphanumérique + tirets + underscores + points, max 100 chars
      return /^[A-Za-z0-9._-]{1,100}$/.test(v) ? v : null

    case 'activityName':
      // Texte libre mais limité (lettres, chiffres, espaces, accents, ponctuation basique)
      // Max 100 chars, au moins 2 chars
      return v.length >= 2 && v.length <= 100 && /^[\p{L}\p{N}\s'._-]+$/u.test(v) ? v : null

    default:
      return null
  }
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

  const validTypes: SearchType[] = ['cmid', 'recordId', 'activityName', 'shortname']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `Type invalide. Valeurs : ${validTypes.join(', ')}` }, { status: 400 })
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
      const cm = await getCourseModule(platform.url, token, parseInt(value, 10))
      if (!cm) {
        return NextResponse.json({ error: `Module ${value} introuvable sur Moodle` }, { status: 404 })
      }
      if (cm.modname !== 'bigbluebuttonbn') {
        return NextResponse.json({ error: `Le module ${value} n'est pas une activité BigBlueButton (type: ${cm.modname})` }, { status: 400 })
      }
      courses = await getCoursesByField(platform.url, token, 'id', cm.course)
      activities = [{ id: cm.instance, course: cm.course, name: cm.name, meetingid: '', coursemodule: cm.id }]
      moodleRecordings = await getRecordingsForActivity(platform.url, token, cm.instance)

    } else if (type === 'shortname') {
      courses = await getCoursesByField(platform.url, token, 'shortname', value)
      if (courses.length > 0) {
        activities = await getBBBActivitiesByCourses(platform.url, token, courses.map(c => c.id))
        const chunks = await Promise.all(
          activities.map(a => getRecordingsForActivity(platform.url, token, a.id).catch(() => [])),
        )
        moodleRecordings = chunks.flat()
      }

    } else if (type === 'activityName') {
      // Recherche par nom : récupérer toutes les activités, filtrer
      const allActivities = await getAllBBBActivities(platform.url, token)
      const needle = value.toLowerCase()
      activities = allActivities.filter(a => (a.name ?? '').toLowerCase().includes(needle))
      if (activities.length === 0) {
        return NextResponse.json({
          platform: { id: platform.id, name: platform.name, siteName: platform.siteName, url: platform.url },
          input: { type, value },
          courses: [], activities: [], probableServer: null, recordings: [],
          summary: { total: 0, synced: 0, moodleOnly: 0, bbbOnly: 0 },
        })
      }
      // Récupérer les cours associés
      const uniqueCourseIds = [...new Set(activities.map(a => a.course))]
      const courseChunks = await Promise.all(
        uniqueCourseIds.map(id => getCoursesByField(platform.url, token, 'id', id).catch(() => [])),
      )
      courses = courseChunks.flat()
      // Recordings Moodle de chaque activité
      const chunks = await Promise.all(
        activities.map(a => getRecordingsForActivity(platform.url, token, a.id).catch(() => [])),
      )
      moodleRecordings = chunks.flat()

    } else if (type === 'recordId') {
      // Recherche directe par recordID — pas d'appel Moodle, on cherche en base.
      // On pourra essayer ensuite de retrouver le cours via bbb-context-id.
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Erreur Moodle : ${err.message}` }, { status: 400 })
  }

  // ─── Recherche en base BBB Manager ──────────────────────────────────
  const meetingIdPrefixes = activities.map(a => a.meetingid).filter(Boolean)
  const courseIds = courses.map(c => String(c.id))
  const moodleRecordIds = moodleRecordings.map(r => r.recordId).filter((x): x is string => !!x)

  const orConditions: any[] = []
  if (type === 'recordId') {
    orConditions.push({ recordId: value })
  } else {
    for (const m of meetingIdPrefixes) orConditions.push({ meetingId: { startsWith: m } })
    for (const cid of courseIds) {
      orConditions.push({ rawData: { path: ['metadata', 'bbb-context-id'], equals: cid } })
    }
    for (const rid of moodleRecordIds) orConditions.push({ recordId: rid })
  }

  const bbbRecordings = orConditions.length === 0 ? [] : await prisma.recording.findMany({
    where: { OR: orConditions },
    include: { server: { select: { name: true, url: true } } },
    orderBy: { startTime: 'desc' },
    take: 500,
  })

  // ─── Croisement ─────────────────────────────────────────────────────
  const bbbByRecordId = new Map(bbbRecordings.map(r => [r.recordId, r]))
  const moodleByRecordId = new Map(
    moodleRecordings.filter(r => r.recordId).map(r => [r.recordId!, r]),
  )
  const allRecordIds = new Set<string>([...moodleByRecordId.keys(), ...bbbByRecordId.keys()])

  // Serveur le plus probable
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
    platform: { id: platform.id, name: platform.name, siteName: platform.siteName, url: platform.url },
    input: { type, value },
    courses,
    activities,
    probableServer: probableServer ? { name: probableServer.name, url: probableServer.url } : null,
    recordings: enriched,
    summary,
  })
}
