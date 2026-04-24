import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RECORDINGS_PER_PAGE, MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'
import { requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const filter = searchParams.get('filter')
  const serverId = searchParams.get('serverId')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const search = searchParams.get('search')?.trim()

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

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { recordId: { contains: search, mode: 'insensitive' } },
      { meetingId: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (serverId) {
    where.serverId = serverId
  }

  if (dateFrom || dateTo) {
    const startTimeFilter: Record<string, Date> = {}
    if (dateFrom) startTimeFilter.gte = new Date(dateFrom)
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      startTimeFilter.lte = end
    }
    where.startTime = startTimeFilter
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
