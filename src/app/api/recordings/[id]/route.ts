import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

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
