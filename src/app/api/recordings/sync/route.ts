import { NextResponse } from 'next/server'
import { requireAuth, rateLimit } from '@/lib/api-helpers'
import { syncAllServers } from '@/lib/sync'

export async function POST() {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  // Max 5 syncs par minute par user (évite les double-clics accidentels et abus)
  const rl = await rateLimit(`sync:${a.user.id}`, 5, 60)
  if (rl) return rl

  const result = await syncAllServers(`manual:${a.user.id}`)

  return NextResponse.json({ synced: result.synced, errors: result.errors })
}
