import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  return NextResponse.json({
    id:       session.user.id,
    fullName: session.user.fullName,
    role:     session.user.role,
    email:    session.user.email,
  })
}
