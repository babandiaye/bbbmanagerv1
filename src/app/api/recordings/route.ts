import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECORDINGS_PER_PAGE, MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const filter = searchParams.get('filter')

  const where: Record<string, unknown> = {}
  if (filter === 'unpublished') {
    where.published = false
  } else if (filter === 'rebuildable') {
    where.published = false
    where.state = { in: [...REBUILDABLE_STATES] }
    where.durationSec = { gte: MIN_RECORDING_DURATION_SEC }
  } else if (filter === 'short') {
    where.durationSec = { lt: MIN_RECORDING_DURATION_SEC }
  }

  const [recordings, total] = await Promise.all([
    prisma.recording.findMany({
      where,
      orderBy: { startTime: 'desc' },
      include: { server: { select: { name: true } } },
      skip: (page - 1) * RECORDINGS_PER_PAGE,
      take: RECORDINGS_PER_PAGE,
    }),
    prisma.recording.count({ where }),
  ])

  return NextResponse.json({
    recordings,
    total,
    page,
    totalPages: Math.ceil(total / RECORDINGS_PER_PAGE),
  })
}
