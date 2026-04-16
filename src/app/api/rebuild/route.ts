import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { publishRecording } from '@/lib/bbb'
import { MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

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
  if (recording.durationSec < MIN_RECORDING_DURATION_SEC) return NextResponse.json({ error: 'Durée insuffisante (< 10 min)' }, { status: 400 })

  // Créer le job
  const job = await prisma.rebuildJob.create({
    data: {
      recordingId,
      serverId: recording.serverId,
      userId:   session.user.id,
      status:   'running',
      startedAt: new Date(),
    },
  })

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
      return NextResponse.json({ success: true, jobId: job.id })
    } else {
      await prisma.rebuildJob.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), errorMsg: 'BBB a retourné une erreur' },
      })
      return NextResponse.json({ error: 'Rebuild échoué' }, { status: 500 })
    }
  } catch (err: any) {
    await prisma.rebuildJob.update({
      where: { id: job.id },
      data: { status: 'failed', finishedAt: new Date(), errorMsg: err.message },
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
