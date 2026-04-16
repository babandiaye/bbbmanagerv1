import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/crypto'
import { bbbCall } from '@/lib/bbb'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const servers = await prisma.bbbServer.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { recordings: true } } },
  })

  // Ne jamais retourner le secret en clair
  return NextResponse.json(
    servers.map((s) => ({
      id:          s.id,
      name:        s.name,
      url:         s.url,
      isActive:    s.isActive,
      lastSyncAt:  s.lastSyncAt,
      createdAt:   s.createdAt,
      recordings:  s._count.recordings,
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { name, url, secret } = await req.json()
  if (!name || !url || !secret) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  // Valider le format de l'URL
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'L\'URL doit utiliser http ou https' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Format d\'URL invalide' }, { status: 400 })
  }

  // Vérifier la connexion au serveur BBB avant de sauvegarder
  try {
    const cleanUrl = url.replace(/\/$/, '')
    await bbbCall(cleanUrl, secret, 'getMeetings')
  } catch {
    return NextResponse.json({ error: 'Impossible de contacter le serveur BBB' }, { status: 400 })
  }

  const server = await prisma.bbbServer.create({
    data: {
      name,
      url:       url.replace(/\/$/, ''),
      secretEnc: encrypt(secret),
    },
  })

  return NextResponse.json({ id: server.id, name: server.name, url: server.url }, { status: 201 })
}
