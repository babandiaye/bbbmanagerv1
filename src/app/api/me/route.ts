import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  return NextResponse.json({
    id:       a.user.id,
    fullName: a.user.fullName,
    role:     a.user.role,
    email:    a.user.email,
  })
}
