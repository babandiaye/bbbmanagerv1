import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { publishRecording } from '@/lib/bbb'
import { MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'
import { requireAuth, rateLimit } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  // Max 30 publications par minute par admin
  const rl = await rateLimit(`rebuild:${a.user.id}`, 30, 60)
  if (rl) return rl

  const { recordingId } = await req.json()
  if (!recordingId) return NextResponse.json({ error: 'recordingId manquant' }, { status: 400 })

  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { server: true },
  })

  if (!recording) return NextResponse.json({ error: 'Enregistrement introuvable' }, { status: 404 })
  if (recording.published) return NextResponse.json({ error: 'Déjà publié' }, { status: 400 })
  if (!REBUILDABLE_STATES.includes(recording.state as any)) {
    return NextResponse.json({ error: `État "${recording.state}" non rebuilable` }, { status: 400 })
  }
  if (recording.durationSec < MIN_RECORDING_DURATION_SEC) return NextResponse.json({ error: 'Durée insuffisante (< 15 min)' }, { status: 400 })

  // Créer le job
  const job = await prisma.rebuildJob.create({
    data: {
      recordingId,
      serverId: recording.serverId,
      userId:   a.user.id,
      status:   'running',
      startedAt: new Date(),
    },
  })

  logger.info(
    { userId: a.user.id, recordingId, recordId: recording.recordId, serverId: recording.serverId },
    'Publication lancée'
  )

  // Lancer le rebuild
  try {
    const secret = decrypt(recording.server.secretEnc)
    const success = await publishRecording(recording.server.url, secret, recording.recordId)

    if (success) {
      await Promise.all([
        prisma.rebuildJob.update({
          where: { id: job.id },
          data: { status: 'done', finishedAt: new Date() },
        }),
        prisma.recording.update({
          where: { id: recordingId },
          data: { published: true },
        }),
      ])
      logger.info({ userId: a.user.id, recordingId, jobId: job.id }, 'Publication réussie')
      return NextResponse.json({ success: true, jobId: job.id })
    } else {
      await prisma.rebuildJob.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), errorMsg: 'BBB a retourné une erreur' },
      })
      logger.warn({ userId: a.user.id, recordingId, jobId: job.id }, 'Publication refusée par BBB')
      return NextResponse.json({ error: 'Rebuild échoué' }, { status: 500 })
    }
  } catch (err: any) {
    await prisma.rebuildJob.update({
      where: { id: job.id },
      data: { status: 'failed', finishedAt: new Date(), errorMsg: err.message },
    })
    logger.error({ err: err.message, recordingId, jobId: job.id }, 'Erreur lors de la publication')
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
