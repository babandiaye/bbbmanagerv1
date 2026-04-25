import axios from 'axios'

/**
 * Client générique pour appeler l'API REST Moodle Web Services.
 * Endpoint : {baseUrl}/webservice/rest/server.php
 * Auth : token dans le paramètre `wstoken`
 * Format : JSON (`moodlewsrestformat=json`)
 */
export async function moodleCall<T = any>(
  baseUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number | string[] | number[]> = {},
): Promise<T> {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const url = `${cleanBase}/webservice/rest/server.php`

  // Moodle accepte GET ou POST. On utilise POST pour supporter les paramètres
  // longs (ex: tableaux de courseids) sans limite d'URL.
  const formData = new URLSearchParams()
  formData.set('wstoken', token)
  formData.set('wsfunction', wsfunction)
  formData.set('moodlewsrestformat', 'json')

  // Sérialisation des paramètres Moodle (tableau → key[0]=a&key[1]=b)
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => formData.set(`${key}[${i}]`, String(v)))
    } else {
      formData.set(key, String(value))
    }
  }

  const response = await axios.post(url, formData.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  })

  // Moodle retourne HTTP 200 même en cas d'erreur, avec { exception, errorcode, message }
  const data = response.data
  if (data && typeof data === 'object' && 'exception' in data) {
    throw new Error(
      `Moodle ${wsfunction} : ${data.errorcode ?? 'unknown'} — ${data.message ?? 'erreur inconnue'}`,
    )
  }

  return data as T
}

/**
 * Infos du site Moodle + utilisateur lié au token.
 * Utilisé au moment de l'ajout d'une plateforme pour valider la connexion.
 * Dispo dans tous les services Moodle par défaut.
 */
export type MoodleSiteInfo = {
  sitename: string
  username: string
  firstname: string
  lastname: string
  fullname: string
  release: string
  version: string
}

export async function getSiteInfo(baseUrl: string, token: string): Promise<MoodleSiteInfo> {
  return moodleCall<MoodleSiteInfo>(baseUrl, token, 'core_webservice_get_site_info')
}

/**
 * Recherche des cours par un champ (id, shortname, idnumber, category, ...).
 * https://docs.moodle.org/dev/Web_service_API_functions#core_course_get_courses_by_field
 */
export type MoodleCourse = {
  id: number
  fullname: string
  shortname: string
  idnumber?: string
  categoryid?: number
  categoryname?: string
  summary?: string
  visible?: number
}

export async function getCoursesByField(
  baseUrl: string,
  token: string,
  field: 'id' | 'ids' | 'shortname' | 'idnumber' | 'category',
  value: string | number,
): Promise<MoodleCourse[]> {
  const result = await moodleCall<{ courses: MoodleCourse[] }>(
    baseUrl,
    token,
    'core_course_get_courses_by_field',
    { field, value: String(value) },
  )
  return result.courses ?? []
}

/**
 * Récupère toutes les activités BigBlueButton d'un ou plusieurs cours.
 * Retourne entre autres le meetingid (clé de liaison avec les enregistrements BBB).
 * https://docs.moodle.org/dev/Web_service_API_functions#mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses
 */
export type MoodleBBBActivity = {
  id: number                   // ID du module BBB
  course: number               // ID du cours
  name: string                 // Nom de l'activité
  meetingid: string            // Clé utilisée par BBB pour le meetingID
  intro?: string
  type?: number
  recordallfromstart?: boolean
  coursemodule?: number        // cmid
  [key: string]: any
}

export async function getBBBActivitiesByCourses(
  baseUrl: string,
  token: string,
  courseIds: number[],
): Promise<MoodleBBBActivity[]> {
  const result = await moodleCall<{ bigbluebuttonbns: MoodleBBBActivity[] }>(
    baseUrl,
    token,
    'mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses',
    { courseids: courseIds },
  )
  return result.bigbluebuttonbns ?? []
}

// ─────────────────────────────────────────────────────────────────────
//  Résolution d'un cmid (course module id) vers son activité BBB
// ─────────────────────────────────────────────────────────────────────

export type MoodleCourseModule = {
  id: number
  course: number
  module: number
  name: string
  modname: string
  instance: number
  section: number
  visible: number
  [key: string]: any
}

export async function getCourseModule(
  baseUrl: string,
  token: string,
  cmid: number,
): Promise<MoodleCourseModule | null> {
  try {
    const res = await moodleCall<{ cm: MoodleCourseModule; warnings: any[] }>(
      baseUrl,
      token,
      'core_course_get_course_module',
      { cmid },
    )
    return res.cm ?? null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Recordings via mod_bigbluebuttonbn_get_recordings
//  Moodle retourne du HTML (DataTable). On parse pour extraire les champs.
// ─────────────────────────────────────────────────────────────────────

export type MoodleRecording = {
  moodleId: string
  recordId: string | null
  name: string
  description: string
  publishedOnMoodle: boolean
  imported: boolean
  playbackUrls: string[]
  startTimeMs: number | null
  durationMin: number | null
}

function stripHtml(html: unknown): string {
  if (typeof html !== 'string') return String(html ?? '')
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseRecordingRow(row: any): MoodleRecording {
  const actionbar: string = typeof row.actionbar === 'string' ? row.actionbar : ''
  const playback: string = typeof row.playback === 'string' ? row.playback : ''
  const recordingCol: string = typeof row.recording === 'string' ? row.recording : ''
  const descriptionCol: string = typeof row.description === 'string' ? row.description : ''

  const moodleIdMatch = actionbar.match(/data-recordingid="(\d+)"/)
                     ?? recordingCol.match(/data-itemid="(\d+)"/)
  const moodleId = moodleIdMatch?.[1] ?? ''

  const recordIdMatch = actionbar.match(
    /id="recording-(?:publish|unpublish|delete|import|protect|unprotect)-([a-f0-9]{40}-\d+)"/,
  )
  const recordId = recordIdMatch?.[1] ?? null

  const publishedOnMoodle = /id="recording-publish-[^"]+"\s+class="[^"]*\bdisabled\b/.test(actionbar)

  const importedMatch = playback.match(/data-imported="(\d)"/)
  const imported = importedMatch?.[1] === '1'

  const playbackUrls: string[] = []
  const hrefRegex = /href="(https?:\/\/[^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = hrefRegex.exec(playback)) !== null) {
    playbackUrls.push(m[1].replace(/&amp;/g, '&'))
  }

  const nameMatch = recordingCol.match(/data-value="([^"]*)"/)
  const name = nameMatch?.[1] ?? stripHtml(recordingCol)

  const descMatch = descriptionCol.match(/data-value="([^"]*)"/)
  const description = descMatch?.[1] ?? ''

  const startTimeMs = typeof row.date === 'number' ? row.date : Number(row.date) || null
  const durationMin = typeof row.duration === 'number' ? row.duration : Number(row.duration) || null

  return {
    moodleId,
    recordId,
    name,
    description,
    publishedOnMoodle,
    imported,
    playbackUrls,
    startTimeMs,
    durationMin,
  }
}

export async function getRecordingsForActivity(
  baseUrl: string,
  token: string,
  bigbluebuttonbnid: number,
): Promise<MoodleRecording[]> {
  const res = await moodleCall<{
    status: boolean
    tabledata: { data: string }
    warnings: any[]
  }>(baseUrl, token, 'mod_bigbluebuttonbn_get_recordings', { bigbluebuttonbnid })

  if (!res.status || !res.tabledata?.data) return []
  let rows: any[]
  try {
    rows = JSON.parse(res.tabledata.data)
  } catch {
    return []
  }
  return rows.map(parseRecordingRow).filter(r => r.moodleId)
}
