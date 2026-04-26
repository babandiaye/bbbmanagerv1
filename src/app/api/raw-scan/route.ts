import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { triggerRawScan, getLastRawScanResult } from '@/lib/cron'
import { logger } from '@/lib/logger'

/**
 * GET /api/raw-scan : retourne le dernier resultat (metadata).
 * POST /api/raw-scan : declenche un scan manuel (admin).
 */
export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const last = await getLastRawScanResult()
  return NextResponse.json({ last })
}

export async function POST() {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  logger.info({ userId: a.user.id }, 'Raw scan manuel declenche')
  const r = await triggerRawScan()
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 409 })
  return NextResponse.json({ result: r.result })
}
