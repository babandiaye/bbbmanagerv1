import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { getRecordings } from '@/lib/bbb'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const servers = await prisma.bbbServer.findMany({ where: { isActive: true } })

  let synced = 0
  const errors: string[] = []

  for (const server of servers) {
    try {
      const secret = decrypt(server.secretEnc)
      const recordings = await getRecordings(server.url, secret)

      for (const rec of recordings) {
        // Calcul de la durée en secondes
        // - Si playback.format.length existe (published/processed) → en minutes, convertir
        // - Sinon (raw) → calculer depuis startTime/endTime (en ms)
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
      errors.push(`${server.name}: ${err.message}`)
    }
  }

  return NextResponse.json({ synced, errors })
}
