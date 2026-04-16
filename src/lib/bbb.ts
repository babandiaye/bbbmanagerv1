import crypto from 'crypto'
import axios from 'axios'
import { parseStringPromise } from 'xml2js'

export function bbbChecksum(action: string, params: string, secret: string): string {
  return crypto
    .createHash('sha256')
    .update(action + params + secret)
    .digest('hex')
}

export function bbbUrl(
  baseUrl: string,
  secret: string,
  action: string,
  params: Record<string, string> = {}
): string {
  const queryString = new URLSearchParams(params).toString()
  const checksum = bbbChecksum(action, queryString, secret)
  const sep = queryString ? '&' : ''
  return `${baseUrl}/api/${action}?${queryString}${sep}checksum=${checksum}`
}

export async function bbbCall(
  baseUrl: string,
  secret: string,
  action: string,
  params: Record<string, string> = {}
): Promise<any> {
  const url = bbbUrl(baseUrl, secret, action, params)
  const response = await axios.get(url, { timeout: 15000 })
  const parsed = await parseStringPromise(response.data, {
    explicitArray: false,
    mergeAttrs: true,
  })
  return parsed.response
}

/**
 * Récupère tous les enregistrements d'un serveur BBB.
 * Utilise la pagination native BBB (offset/limit max 100) pour tout récupérer.
 * state=any pour inclure processing, processed, published, unpublished.
 */
export async function getRecordings(baseUrl: string, secret: string): Promise<any[]> {
  const allRecordings: any[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const response = await bbbCall(baseUrl, secret, 'getRecordings', {
      state: 'any',
      offset: String(offset),
      limit: String(limit),
    })

    if (response.returncode !== 'SUCCESS') break

    const recordings = response.recordings?.recording
    if (!recordings) break

    const batch = Array.isArray(recordings) ? recordings : [recordings]
    allRecordings.push(...batch)

    // Si totalElements disponible (BBB 2.7+), vérifier si on a tout
    const total = parseInt(response.totalElements, 10)
    if (!isNaN(total) && allRecordings.length >= total) break

    // Sinon, si le batch est incomplet, on a tout
    if (batch.length < limit) break

    offset += limit
  }

  return allRecordings
}

/** Publie un enregistrement (processed → published) */
export async function publishRecording(
  baseUrl: string,
  secret: string,
  recordId: string
): Promise<boolean> {
  const response = await bbbCall(baseUrl, secret, 'publishRecordings', {
    recordID: recordId,
    publish: 'true',
  })
  return response.returncode === 'SUCCESS'
}

/** Dé-publie un enregistrement (published → unpublished) */
export async function unpublishRecording(
  baseUrl: string,
  secret: string,
  recordId: string
): Promise<boolean> {
  const response = await bbbCall(baseUrl, secret, 'publishRecordings', {
    recordID: recordId,
    publish: 'false',
  })
  return response.returncode === 'SUCCESS'
}

/** Supprime définitivement un enregistrement du serveur BBB */
export async function deleteRecording(
  baseUrl: string,
  secret: string,
  recordId: string
): Promise<boolean> {
  const response = await bbbCall(baseUrl, secret, 'deleteRecordings', {
    recordID: recordId,
  })
  return response.returncode === 'SUCCESS'
}
