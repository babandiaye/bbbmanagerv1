import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { getRecordings } from '@/lib/bbb'
import { logger } from '@/lib/logger'

export type SyncResult = {
  synced: number
  errors: string[]
  durationMs: number
  serversProcessed: number
  startedAt: Date
  finishedAt: Date
}

/**
 * Synchronise tous les serveurs BBB actifs avec la base de données.
 * Factorisé pour être appelé depuis la route manuelle POST /api/recordings/sync
 * et depuis le cron auto.
 *
 * @param trigger  identifiant pour les logs (ex: 'manual:user-123' ou 'cron')
 */
export async function syncAllServers(trigger: string): Promise<SyncResult> {
  const startedAt = new Date()
  const t0 = Date.now()
  logger.info({ trigger }, 'Synchronisation lancée')

  const servers = await prisma.bbbServer.findMany({ where: { isActive: true } })

  let synced = 0
  const errors: string[] = []

  for (const server of servers) {
    try {
      const secret = decrypt(server.secretEnc)
      const recordings = await getRecordings(server.url, secret)

      for (const rec of recordings) {
        // Calcul de la durée en secondes
        let durationSec = 0
        if (rec.playback?.format?.length) {
          const lengthMin = parseInt(rec.playback.format.length, 10)
          durationSec = isNaN(lengthMin) ? 0 : lengthMin * 60
        } else if (rec.startTime && rec.endTime) {
          const diff = parseInt(rec.endTime) - parseInt(rec.startTime)
          durationSec = Math.floor(diff / 1000)
        }

        const name = rec.name
          ?? rec.meta?.['bbb-recording-name']
          ?? rec.meta?.meetingName
          ?? rec.meetingName
          ?? 'Sans titre'

        await prisma.recording.upsert({
          where: { recordId: rec.recordID },
          update: {
            name,
            published:   rec.published === 'true',
            state:       rec.state ?? 'unknown',
            durationSec,
            playbackUrl: rec.playback?.format?.url ?? null,
            rawData:     rec,
            updatedAt:   new Date(),
          },
          create: {
            recordId:    rec.recordID,
            meetingId:   rec.meetingID ?? rec.meta?.meetingId ?? '',
            name,
            published:   rec.published === 'true',
            state:       rec.state ?? 'unknown',
            durationSec,
            startTime:   new Date(parseInt(rec.startTime)),
            endTime:     rec.endTime ? new Date(parseInt(rec.endTime)) : null,
            playbackUrl: rec.playback?.format?.url ?? null,
            rawData:     rec,
            serverId:    server.id,
          },
        })
        synced++
      }

      await prisma.bbbServer.update({
        where: { id: server.id },
        data: { lastSyncAt: new Date() },
      })
    } catch (err: any) {
      logger.error(
        { err: err.message, serverId: server.id, serverName: server.name, trigger },
        'Échec sync serveur BBB'
      )
      errors.push(`${server.name}: ${err.message}`)
    }
  }

  const durationMs = Date.now() - t0
  const finishedAt = new Date()

  logger.info(
    { trigger, synced, errors: errors.length, durationMs, serversProcessed: servers.length },
    'Synchronisation terminée'
  )

  return { synced, errors, durationMs, serversProcessed: servers.length, startedAt, finishedAt }
}
