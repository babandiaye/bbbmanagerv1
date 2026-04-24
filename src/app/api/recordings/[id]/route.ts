import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const { id } = await params

  const recording = await prisma.recording.findUnique({
    where: { id },
    include: {
      server: { select: { id: true, name: true, url: true } },
      rebuildJobs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { fullName: true, email: true } },
        },
      },
    },
  })

  if (!recording) {
    return NextResponse.json({ error: 'Enregistrement introuvable' }, { status: 404 })
  }

  return NextResponse.json(recording)
}
