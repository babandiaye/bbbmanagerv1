import axios from 'axios'
import { parseStringPromise } from 'xml2js'

const MIN_DURATION_SEC = 15 * 60         // 15 minutes
const MIN_PARTICIPANTS = 2                // au moins 2 participants

/**
 * Construit l'URL events.xml d'un recording sur un serveur BBB.
 * Pattern : <rawIndexUrl>/<recordId>/events.xml
 */
export function buildEventsUrl(rawIndexUrl: string, recordId: string): string {
  const base = rawIndexUrl.replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(recordId)}/events.xml`
}

export type EventsAnalysis = {
  recordId: string
  bbbVersion?: string
  meetingExternalId?: string         // meetingId Moodle complet
  meetingName?: string
  bbbContextId?: string
  bbbContextName?: string
  bbbContextLabel?: string
  bbbOriginServerName?: string
  bbbRecordingName?: string
  startTimeMs: number | null
  endTimeMs: number | null
  durationSec: number | null
  participantCount: number
  participantNames: string[]
  chatMessageCount: number
  hasScreenShare: boolean
  hasWebcam: boolean
  isRebuildable: boolean
  rebuildReasons: string[]
}

/**
 * Télécharge et parse events.xml d'un recording.
 * Retourne null si l'URL est inaccessible (404, timeout, erreur réseau, auth).
 *
 * @param auth - "user:password" en clair (déjà déchiffré). Optionnel.
 */
export async function fetchAndAnalyzeEvents(
  rawIndexUrl: string,
  recordId: string,
  auth?: string | null,
): Promise<EventsAnalysis | null> {
  const url = buildEventsUrl(rawIndexUrl, recordId)
  let xml: string
  try {
    const headers: Record<string, string> = {}
    if (auth) {
      headers.Authorization = 'Basic ' + Buffer.from(auth).toString('base64')
    }
    const res = await axios.get<string>(url, {
      timeout: 10000,
      responseType: 'text',
      validateStatus: (s) => s === 200,
      headers,
    })
    xml = res.data
  } catch {
    return null
  }
  return parseEventsXml(recordId, xml)
}

/**
 * Parse un events.xml BBB et calcule les métriques de la session.
 * Si le XML est invalide, retourne un objet avec des valeurs par défaut.
 */
export async function parseEventsXml(
  recordId: string,
  xml: string,
): Promise<EventsAnalysis> {
  let parsed: any
  try {
    parsed = await parseStringPromise(xml, { explicitArray: true, mergeAttrs: false })
  } catch {
    return emptyAnalysis(recordId)
  }

  const recording = parsed?.recording
  if (!recording) return emptyAnalysis(recordId)

  // Métadonnées
  const meeting = recording.meeting?.[0]?.$  ?? {}
  const meta    = recording.metadata?.[0]?.$ ?? {}
  const bbbVersion = recording.$?.bbb_version

  const events: any[] = recording.event ?? []

  // Calculer début/fin via les timestampUTC
  let startMs: number | null = null
  let endMs: number | null = null

  // Compteurs
  const participantIds = new Set<string>()
  const participantNames: string[] = []
  let chatMessageCount = 0
  let hasScreenShare = false
  let hasWebcam = false

  for (const ev of events) {
    const attr = ev.$ ?? {}
    const eventName = attr.eventname ?? ''
    const moduleName = attr.module ?? ''
    const tsRaw = ev.timestampUTC?.[0]
    const ts = tsRaw ? parseInt(tsRaw, 10) : NaN

    if (!isNaN(ts)) {
      if (startMs === null || ts < startMs) startMs = ts
      if (endMs === null || ts > endMs) endMs = ts
    }

    // Participants : seulement les "vrais" rejoins via PARTICIPANT (pas les sous-événements VOICE)
    if (moduleName === 'PARTICIPANT' && eventName === 'ParticipantJoinEvent') {
      const userId = ev.userId?.[0]
      const name   = ev.name?.[0]
      if (userId && !participantIds.has(userId)) {
        participantIds.add(userId)
        if (name) participantNames.push(name)
      }
    }

    // Chat
    if (moduleName === 'CHAT' && (
      eventName === 'PublicChatEvent' ||
      eventName === 'PrivateChatEvent' ||
      eventName === 'ChatGroupMessageEvent' ||
      eventName === 'SendPublicChatEvent' ||
      eventName === 'SendPrivateChatEvent'
    )) {
      chatMessageCount++
    }

    // Partage d'écran
    if (eventName === 'StartWebRTCDesktopShareEvent' ||
        eventName === 'DeskShareStartedEvent' ||
        eventName === 'StartScreenShareEvent') {
      hasScreenShare = true
    }

    // Webcam
    if (eventName === 'StartWebcamShareEvent' ||
        eventName === 'StartWebRTCShareEvent' ||
        eventName === 'WebcamStreamSubscribedEvent') {
      hasWebcam = true
    }
  }

  const durationSec = (startMs !== null && endMs !== null)
    ? Math.floor((endMs - startMs) / 1000)
    : null

  // Critères de rebuild : AND strict — durée ≥ 15 min ET participants ≥ 2
  const reasons: string[] = []
  const durationOk = durationSec !== null && durationSec >= MIN_DURATION_SEC
  const participantsOk = participantIds.size >= MIN_PARTICIPANTS
  if (durationOk) reasons.push(`${Math.round(durationSec! / 60)} min`)
  if (participantsOk) reasons.push(`${participantIds.size} participants`)
  if (chatMessageCount > 0) reasons.push(`${chatMessageCount} chat`)
  if (hasScreenShare) reasons.push('écran')
  if (hasWebcam) reasons.push('webcam')
  const isRebuildable = durationOk && participantsOk

  return {
    recordId,
    bbbVersion,
    meetingExternalId: meeting.externalId,
    meetingName: meeting.name,
    bbbContextId: meta['bbb-context-id'],
    bbbContextName: meta['bbb-context-name'],
    bbbContextLabel: meta['bbb-context-label'],
    bbbOriginServerName: meta['bbb-origin-server-name'],
    bbbRecordingName: meta['bbb-recording-name'],
    startTimeMs: startMs,
    endTimeMs: endMs,
    durationSec,
    participantCount: participantIds.size,
    participantNames: participantNames.slice(0, 20), // limiter
    chatMessageCount,
    hasScreenShare,
    hasWebcam,
    isRebuildable,
    rebuildReasons: reasons,
  }
}

/**
 * Liste les dossiers présents dans l'index raw d'un serveur via Nginx autoindex.
 * Suppose autoindex_format=json. Retourne la liste des recordIDs avec leur mtime.
 *
 * @param prefix - filtre optionnel : ne retourne que les recordIDs commençant par ce préfixe
 *                 (utile pour cibler une activité BBB précise via son SHA1)
 */
export async function listRawDirectories(
  rawIndexUrl: string,
  auth?: string | null,
  prefix?: string,
): Promise<{ recordId: string; mtimeMs: number }[]> {
  const cleanUrl = rawIndexUrl.replace(/\/+$/, '') + '/'
  try {
    const headers: Record<string, string> = {}
    if (auth) headers.Authorization = 'Basic ' + Buffer.from(auth).toString('base64')
    const res = await axios.get(cleanUrl, {
      timeout: 15000,
      headers,
      validateStatus: (s) => s === 200,
    })
    const data = res.data
    if (!Array.isArray(data)) return []
    const filtered = data
      .filter((d: any) => d?.type === 'directory' && typeof d.name === 'string')
      .filter((d: any) => !prefix || d.name.startsWith(prefix))
      .map((d: any) => ({
        recordId: d.name as string,
        mtimeMs: d.mtime ? new Date(d.mtime).getTime() : 0,
      }))
    return filtered
  } catch {
    return []
  }
}

function emptyAnalysis(recordId: string): EventsAnalysis {
  return {
    recordId,
    startTimeMs: null,
    endTimeMs: null,
    durationSec: null,
    participantCount: 0,
    participantNames: [],
    chatMessageCount: 0,
    hasScreenShare: false,
    hasWebcam: false,
    isRebuildable: false,
    rebuildReasons: [],
  }
}
