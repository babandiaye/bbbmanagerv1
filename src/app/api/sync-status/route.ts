import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { getLastAutoSyncResult } from '@/lib/cron'

/**
 * Retourne le statut de la dernière sync auto.
 * Utilisé par l'UI pour afficher une notification en cas d'échec.
 */
export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const last = await getLastAutoSyncResult()
  if (!last) {
    return NextResponse.json({ hasData: false })
  }

  const hasErrors = last.errors.length > 0
  return NextResponse.json({
    hasData: true,
    hasErrors,
    ...last,
  })
}
