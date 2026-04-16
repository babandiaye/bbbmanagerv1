import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { publishRecording } from '@/lib/bbb'

/**
 * POST /api/rebuild-batch
 * Body: { recordIds: string[] }
 *
 * Accepte une liste de record IDs BBB (pas les UUIDs DB).
 * Mappe chaque ID au serveur BBB correspondant via la table recordings.
 * Appelle publishRecordings via l'API BBB pour chaque ID.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { recordIds } = await req.json()
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return NextResponse.json({ error: 'recordIds requis (tableau non vide)' }, { status: 400 })
  }

  if (recordIds.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 IDs par requête' }, { status: 400 })
  }

  // Nettoyer les IDs (trim, supprimer les vides)
  const cleanIds = [...new Set(recordIds.map((id: string) => id.trim()).filter(Boolean))]

  // Chercher les recordings en base pour mapper chaque ID à son serveur
  const recordings = await prisma.recording.findMany({
    where: { recordId: { in: cleanIds } },
    include: { server: true },
  })

  const found = new Map(recordings.map(r => [r.recordId, r]))

  const results: {
    recordId: string
    server: string
    status: 'success' | 'error' | 'not_found' | 'already_published' | 'skipped'
    message: string
  }[] = []

  // IDs non trouvés en base
  for (const id of cleanIds) {
    if (!found.has(id)) {
      results.push({ recordId: id, server: '—', status: 'not_found', message: 'ID non trouvé en base. Lancez une synchronisation.' })
    }
  }

  // Traiter les IDs trouvés
  for (const [recordId, rec] of found) {
    // Déjà publié
    if (rec.published) {
      results.push({ recordId, server: rec.server.name, status: 'already_published', message: 'Déjà publié' })
      continue
    }

    // Serveur inactif
    if (!rec.server.isActive) {
      results.push({ recordId, server: rec.server.name, status: 'skipped', message: 'Serveur inactif' })
      continue
    }

    try {
      const secret = decrypt(rec.server.secretEnc)
      const success = await publishRecording(rec.server.url, secret, recordId)

      if (success) {
        // Mettre à jour en base
        await Promise.all([
          prisma.recording.update({
            where: { id: rec.id },
            data: { published: true, state: 'published' },
          }),
          prisma.rebuildJob.create({
            data: {
              recordingId: rec.id,
              serverId: rec.serverId,
              userId: session.user.id,
              status: 'done',
              startedAt: new Date(),
              finishedAt: new Date(),
            },
          }),
        ])
        results.push({ recordId, server: rec.server.name, status: 'success', message: 'Publié avec succès' })
      } else {
        await prisma.rebuildJob.create({
          data: {
            recordingId: rec.id,
            serverId: rec.serverId,
            userId: session.user.id,
            status: 'failed',
            startedAt: new Date(),
            finishedAt: new Date(),
            errorMsg: 'BBB a retourné une erreur',
          },
        })
        results.push({ recordId, server: rec.server.name, status: 'error', message: 'BBB a refusé la publication' })
      }
    } catch (err: any) {
      await prisma.rebuildJob.create({
        data: {
          recordingId: rec.id,
          serverId: rec.serverId,
          userId: session.user.id,
          status: 'failed',
          startedAt: new Date(),
          finishedAt: new Date(),
          errorMsg: err.message,
        },
      })
      results.push({ recordId, server: rec.server.name, status: 'error', message: err.message })
    }
  }

  const summary = {
    total: cleanIds.length,
    success: results.filter(r => r.status === 'success').length,
    alreadyPublished: results.filter(r => r.status === 'already_published').length,
    errors: results.filter(r => r.status === 'error').length,
    notFound: results.filter(r => r.status === 'not_found').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  }

  return NextResponse.json({ summary, results })
}
