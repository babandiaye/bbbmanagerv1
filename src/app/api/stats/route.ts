import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const [
    totalRecordings,
    publishedRecordings,
    unpublishedRecordings,
    rebuildableRecordings,
    pendingJobs,
    runningJobs,
    totalServers,
    activeServers,
  ] = await Promise.all([
    prisma.recording.count(),
    prisma.recording.count({ where: { published: true } }),
    prisma.recording.count({ where: { published: false } }),
    prisma.recording.count({
      where: { published: false, state: { in: [...REBUILDABLE_STATES] }, durationSec: { gte: MIN_RECORDING_DURATION_SEC } },
    }),
    prisma.rebuildJob.count({ where: { status: 'pending' } }),
    prisma.rebuildJob.count({ where: { status: 'running' } }),
    prisma.bbbServer.count(),
    prisma.bbbServer.count({ where: { isActive: true } }),
  ])

  return NextResponse.json({
    totalRecordings,
    publishedRecordings,
    unpublishedRecordings,
    rebuildableRecordings,
    pendingJobs,
    runningJobs,
    totalServers,
    activeServers,
    publishRate: totalRecordings > 0
      ? Math.round((publishedRecordings / totalRecordings) * 100)
      : 0,
  })
}
