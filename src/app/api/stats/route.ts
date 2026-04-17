import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const serverId = req.nextUrl.searchParams.get('serverId') || undefined
  const serverFilter = serverId ? { serverId } : {}

  // groupBy sur state pour avoir le compte par état
  const byStateRaw = await prisma.recording.groupBy({
    by: ['state'],
    where: serverFilter,
    _count: { _all: true },
  })

  const byState: Record<string, number> = {}
  for (const row of byStateRaw) {
    byState[row.state] = row._count._all
  }

  const [
    totalRecordings,
    publishedRecordings,
    unpublishedRecordings,
    rebuildableRecordings,
    shortRecordings,
    pendingJobs,
    runningJobs,
    failedJobs,
    doneJobs,
    totalServers,
    activeServers,
  ] = await Promise.all([
    prisma.recording.count({ where: serverFilter }),
    prisma.recording.count({ where: { ...serverFilter, published: true } }),
    prisma.recording.count({ where: { ...serverFilter, published: false } }),
    prisma.recording.count({
      where: {
        ...serverFilter,
        published: false,
        state: { in: [...REBUILDABLE_STATES] },
        durationSec: { gte: MIN_RECORDING_DURATION_SEC },
      },
    }),
    prisma.recording.count({
      where: { ...serverFilter, durationSec: { lt: MIN_RECORDING_DURATION_SEC } },
    }),
    prisma.rebuildJob.count({ where: { ...serverFilter, status: 'pending' } }),
    prisma.rebuildJob.count({ where: { ...serverFilter, status: 'running' } }),
    prisma.rebuildJob.count({ where: { ...serverFilter, status: 'failed' } }),
    prisma.rebuildJob.count({ where: { ...serverFilter, status: 'done' } }),
    prisma.bbbServer.count(),
    prisma.bbbServer.count({ where: { isActive: true } }),
  ])

  return NextResponse.json({
    totalRecordings,
    publishedRecordings,
    unpublishedRecordings,
    rebuildableRecordings,
    shortRecordings,
    byState: {
      processing: byState.processing ?? 0,
      processed:  byState.processed  ?? 0,
      published:  byState.published  ?? 0,
      unpublished: byState.unpublished ?? 0,
      deleted:    byState.deleted    ?? 0,
      other: Object.entries(byState)
        .filter(([k]) => !['processing','processed','published','unpublished','deleted'].includes(k))
        .reduce((sum, [, v]) => sum + v, 0),
    },
    jobs: {
      pending: pendingJobs,
      running: runningJobs,
      failed:  failedJobs,
      done:    doneJobs,
    },
    totalServers,
    activeServers,
    publishRate: totalRecordings > 0
      ? Math.round((publishedRecordings / totalRecordings) * 100)
      : 0,
  })
}
