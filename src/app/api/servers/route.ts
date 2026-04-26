import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { bbbCall } from '@/lib/bbb'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const servers = await prisma.bbbServer.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { recordings: true } } },
  })

  // Ne jamais retourner le secret/auth en clair
  return NextResponse.json(
    servers.map((s) => ({
      id:               s.id,
      name:             s.name,
      url:              s.url,
      rawIndexUrl:      s.rawIndexUrl,
      hasRawIndexAuth:  !!s.rawIndexAuthEnc,
      isActive:         s.isActive,
      lastSyncAt:       s.lastSyncAt,
      createdAt:        s.createdAt,
      recordings:       s._count.recordings,
    }))
  )
}

export async function POST(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const { name, url, secret, rawIndexUrl, rawIndexUser, rawIndexPassword } = await req.json()
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

  // Encoder l'auth basique en "user:pass" si fourni
  let rawIndexAuthEnc: string | null = null
  const u = rawIndexUser?.trim()
  const p = rawIndexPassword
  if (u && p) {
    rawIndexAuthEnc = encrypt(`${u}:${p}`)
  }

  const server = await prisma.bbbServer.create({
    data: {
      name,
      url:             url.replace(/\/$/, ''),
      secretEnc:       encrypt(secret),
      rawIndexUrl:     rawIndexUrl?.trim() ? rawIndexUrl.trim().replace(/\/+$/, '') + '/' : null,
      rawIndexAuthEnc,
    },
  })

  logger.info({ userId: a.user.id, serverId: server.id, name: server.name }, 'Serveur BBB ajouté')

  return NextResponse.json({ id: server.id, name: server.name, url: server.url }, { status: 201 })
}
