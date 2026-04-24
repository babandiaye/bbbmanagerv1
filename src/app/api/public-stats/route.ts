import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/api-helpers'

/** Endpoint public, sans authentification — expose uniquement 3 agrégats anonymes */
export async function GET(req: NextRequest) {
  // Rate limit par IP pour éviter le scraping (20 req/min)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const rl = await rateLimit(`public-stats:${ip}`, 20, 60)
  if (rl) return rl

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
