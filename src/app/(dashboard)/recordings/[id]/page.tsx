'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  PlayIcon,
  ClockIcon,
  UsersIcon,
  ServerIcon,
  CalendarIcon,
  TagIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'
import { useCurrentUser } from '@/hooks/useCurrentUser'

type RecordingDetail = {
  id: string
  recordId: string
  meetingId: string
  name: string
  durationSec: number
  published: boolean
  state: string
  startTime: string
  endTime: string | null
  playbackUrl: string | null
  rawData: any
  createdAt: string
  updatedAt: string
  server: { id: string; name: string; url: string }
  rebuildJobs: {
    id: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    errorMsg: string | null
    user: { fullName: string | null; email: string }
  }[]
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(d))
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}min ${s}s`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

function StateBadge({ state, published }: { state: string; published: boolean }) {
  if (published || state === 'published') {
    return <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Publié</span>
  }
  if (state === 'processing') {
    return <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">En traitement</span>
  }
  if (state === 'processed') {
    return <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">Traité — non publié</span>
  }
  if (state === 'unpublished') {
    return <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">Dé-publié</span>
  }
  if (state === 'deleted') {
    return <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Supprimé</span>
  }
  return <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">{state}</span>
}

function JobStatusBadge({ status }: { status: string }) {
  const configs: Record<string, string> = {
    done: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-700',
    running: 'bg-blue-50 text-blue-700',
    pending: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${configs[status] || configs.pending}`}>
      {status}
    </span>
  )
}

function InfoRow({ icon: Icon, label, value, mono = false }: {
  icon?: any
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className={`text-sm text-gray-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

export default function RecordingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { isAdmin } = useCurrentUser()
  const [rec, setRec] = useState<RecordingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/recordings/${id}`)
    if (res.status === 404) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const data = await res.json()
    setRec(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleRebuild() {
    if (!rec) return
    setRebuilding(true)
    setMessage('')
    const res = await fetch('/api/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId: rec.id }),
    })
    const data = await res.json()
    if (res.ok) {
      setMessage('Publication lancée avec succès')
      await load()
    } else {
      setMessage(`Erreur : ${data.error}`)
    }
    setRebuilding(false)
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div>
      </div>
    )
  }

  if (notFound || !rec) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link href="/recordings" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline mb-6">
          <ArrowLeftIcon className="w-4 h-4" />
          Retour aux enregistrements
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-8 text-center">
          Enregistrement introuvable
        </div>
      </div>
    )
  }

  const meta = rec.rawData?.metadata || rec.rawData?.meta || {}
  const playback = rec.rawData?.playback?.format || {}
  const participants = rec.rawData?.participants ?? meta.participants ?? '—'
  const rawSize = rec.rawData?.rawSize ? parseInt(rec.rawData.rawSize) : 0
  const playbackSize = playback.size ? parseInt(playback.size) : 0
  const isRebuildable =
    !rec.published &&
    (REBUILDABLE_STATES as readonly string[]).includes(rec.state) &&
    rec.durationSec >= MIN_RECORDING_DURATION_SEC

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back link */}
      <Link href="/recordings" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline mb-4">
        <ArrowLeftIcon className="w-4 h-4" />
        Retour aux enregistrements
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 mb-2 break-words">
              {rec.name}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <StateBadge state={rec.state} published={rec.published} />
              <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                <ServerIcon className="w-3.5 h-3.5" />
                {rec.server.name}
              </span>
              <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5" />
                {formatDate(rec.startTime)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {rec.playbackUrl && (
              <a
                href={rec.playbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                <PlayIcon className="w-4 h-4" />
                Lecture
              </a>
            )}
            {isRebuildable && isAdmin && (
              <button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="text-sm px-4 py-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition disabled:opacity-50"
              >
                {rebuilding ? 'Publication...' : 'Publier'}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className={`text-sm rounded-lg px-4 py-3 ${
            message.startsWith('Erreur')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}>
            {message}
          </div>
        )}
      </div>

      {/* Grid 2 colonnes */}
      <div className="grid grid-cols-3 gap-4">
        {/* Colonne principale */}
        <div className="col-span-2 space-y-4">
          {/* Identifiants */}
          <section className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <TagIcon className="w-4 h-4 text-gray-400" />
              Identifiants
            </h2>
            <InfoRow label="Record ID" value={rec.recordId} mono />
            <InfoRow label="Meeting ID" value={rec.meetingId} mono />
            {rec.rawData?.internalMeetingID && (
              <InfoRow label="Internal meeting ID" value={rec.rawData.internalMeetingID} mono />
            )}
          </section>

          {/* Métadonnées Moodle/BBB */}
          <section className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-gray-400" />
              Contexte pédagogique
            </h2>
            {meta['bbb-context-name'] && (
              <InfoRow label="Cours / Contexte" value={meta['bbb-context-name']} />
            )}
            {meta['bbb-context-label'] && (
              <InfoRow label="Code cours" value={meta['bbb-context-label']} />
            )}
            {meta['bbb-context-id'] && (
              <InfoRow label="ID de contexte Moodle" value={meta['bbb-context-id']} mono />
            )}
            {meta['bbb-recording-name'] && (
              <InfoRow label="Nom d'enregistrement BBB" value={meta['bbb-recording-name']} />
            )}
            {meta['meetingName'] && (
              <InfoRow label="Nom de la réunion" value={meta['meetingName']} />
            )}
            {meta['bbb-recording-description'] && (
              <InfoRow label="Description" value={meta['bbb-recording-description']} />
            )}
            {meta['bbb-origin'] && (
              <InfoRow label="Origine" value={meta['bbb-origin']} />
            )}
            {meta['bbb-origin-server-name'] && (
              <InfoRow label="Serveur d'origine" value={meta['bbb-origin-server-name']} mono />
            )}
            {meta['bbb-origin-version'] && (
              <InfoRow label="Version plugin" value={meta['bbb-origin-version']} />
            )}
            {meta['isBreakout'] && (
              <InfoRow label="Salle de discussion (breakout)" value={meta['isBreakout'] === 'true' ? 'Oui' : 'Non'} />
            )}
          </section>

          {/* Historique des jobs de rebuild */}
          {rec.rebuildJobs && rec.rebuildJobs.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Historique des publications ({rec.rebuildJobs.length})
              </h2>
              <div className="space-y-2">
                {rec.rebuildJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <JobStatusBadge status={job.status} />
                      <div>
                        <p className="text-sm text-gray-800">
                          {job.user.fullName || job.user.email}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(job.startedAt)}
                        </p>
                      </div>
                    </div>
                    {job.errorMsg && (
                      <p className="text-xs text-red-500 max-w-[300px] truncate" title={job.errorMsg}>
                        {job.errorMsg}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar stats */}
        <div className="space-y-4">
          {/* Participants & durée */}
          <section className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Session
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <UsersIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Participants</p>
                  <p className="text-lg font-semibold text-gray-900">{participants}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <ClockIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Durée</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDuration(rec.durationSec)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Dates */}
          <section className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Chronologie</h2>
            <InfoRow label="Début" value={formatDate(rec.startTime)} />
            <InfoRow label="Fin" value={formatDate(rec.endTime)} />
            <InfoRow label="Première sync" value={formatDate(rec.createdAt)} />
            <InfoRow label="Dernière sync" value={formatDate(rec.updatedAt)} />
          </section>

          {/* Fichiers */}
          <section className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Fichiers</h2>
            {playback.type && <InfoRow label="Format playback" value={playback.type} />}
            {playbackSize > 0 && <InfoRow label="Taille playback" value={formatBytes(playbackSize)} />}
            {rawSize > 0 && <InfoRow label="Taille raw" value={formatBytes(rawSize)} />}
            {playback.length && <InfoRow label="Durée (min)" value={playback.length} />}
            {playback.processingTime && (
              <InfoRow label="Temps traitement" value={`${playback.processingTime} ms`} />
            )}
          </section>

          {/* Serveur */}
          <section className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Serveur BBB</h2>
            <InfoRow label="Nom" value={rec.server.name} />
            <InfoRow label="URL" value={rec.server.url} mono />
          </section>
        </div>
      </div>
    </div>
  )
}
