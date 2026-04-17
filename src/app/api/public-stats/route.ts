import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Endpoint public, sans authentification — expose uniquement 3 agrégats anonymes */
export async function GET() {
  try {
    const [servers, recordings, published] = await Promise.all([
      prisma.bbbServer.count({ where: { isActive: true } }),
      prisma.recording.count(),
      prisma.recording.count({ where: { published: true } }),
    ])

    const publishRate = recordings > 0 ? Math.round((published / recordings) * 100) : 0

    return NextResponse.json({ servers, recordings, publishRate })
  } catch {
    return NextResponse.json({ servers: 0, recordings: 0, publishRate: 0 })
  }
}
