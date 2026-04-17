'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import SyncButton from '@/components/SyncButton'
import RebuildButton from '@/components/RebuildButton'
import { MIN_RECORDING_DURATION_SEC } from '@/lib/constants'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const REBUILDABLE_STATES = ['processed', 'unpublished']

type Stats = {
  totalRecordings: number
  publishedRecordings: number
  unpublishedRecordings: number
  rebuildableRecordings: number
  shortRecordings: number
  byState: {
    processing: number
    processed: number
    published: number
    unpublished: number
    deleted: number
    other: number
  }
  jobs: {
    pending: number
    running: number
    failed: number
    done: number
  }
  totalServers: number
  activeServers: number
  publishRate: number
}

type Recording = {
  id: string
  name: string
  durationSec: number
  published: boolean
  state: string
  startTime: string
  server: { name: string }
}

type Server = { id: string; name: string }

function StatCard({ label, value, sub, subColor = 'text-gray-400' }: {
  label: string
  value: string | number
  sub?: string
  subColor?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-medium text-gray-900">{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>}
    </div>
  )
}

function StateCard({ label, value, color, description }: {
  label: string
  value: number
  color: string
  description: string
}) {
  return (
    <div className={`rounded-lg p-4 border ${color}`}>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
      <p className="text-[10px] opacity-70">{description}</p>
    </div>
  )
}

function StatusBadge({ published, state, durationSec }: {
  published: boolean
  state: string
  durationSec: number
}) {
  if (published || state === 'published') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Publié</span>
  )
  if (state === 'processing') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">En traitement</span>
  )
  if (state === 'processed') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">Traité — non publié</span>
  )
  if (state === 'unpublished') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">Dé-publié</span>
  )
  if (durationSec < MIN_RECORDING_DURATION_SEC) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Trop court</span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{state}</span>
  )
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(date))
}

export default function DashboardClient({ fullName }: { fullName: string }) {
  const { isAdmin } = useCurrentUser()
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/servers').then(r => r.json()).then(setServers)
  }, [])

  const loadData = useCallback(async (srv: string) => {
    setLoading(true)
    const statsParams = srv ? `?serverId=${srv}` : ''
    const recParams = new URLSearchParams({ page: '1', filter: 'unpublished' })
    if (srv) recParams.set('serverId', srv)

    const [statsRes, recRes] = await Promise.all([
      fetch(`/api/stats${statsParams}`),
      fetch(`/api/recordings?${recParams}`),
    ])
    const statsData = await statsRes.json()
    const recData = await recRes.json()
    setStats(statsData)
    setRecent(recData.recordings.slice(0, 10))
    setLoading(false)
  }, [])

  useEffect(() => { loadData(selectedServer) }, [selectedServer, loadData])

  const selectedServerName = selectedServer
    ? servers.find(s => s.id === selectedServer)?.name ?? ''
    : 'Tous les serveurs'

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400">Bienvenue, {fullName}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedServer}
            onChange={(e) => setSelectedServer(e.target.value)}
            className="text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-blue-300"
          >
            <option value="">Tous les serveurs</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <SyncButton />
        </div>
      </div>

      {loading || !stats ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
      ) : (
        <>
          {/* Titre scope */}
          <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider">
            Portée : {selectedServerName}
          </p>

          {/* Métriques principales */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Total enregistrements"
              value={stats.totalRecordings}
              sub={selectedServer ? '' : `${stats.activeServers}/${stats.totalServers} serveurs actifs`}
            />
            <StatCard
              label="Non publiés"
              value={stats.unpublishedRecordings}
              sub={`dont ${stats.rebuildableRecordings} publiables`}
              subColor="text-red-500"
            />
            <StatCard
              label="Jobs"
              value={stats.jobs.pending + stats.jobs.running}
              sub={`${stats.jobs.running} en cours · ${stats.jobs.failed} échoués`}
              subColor={stats.jobs.failed > 0 ? 'text-red-500' : 'text-gray-400'}
            />
            <StatCard
              label="Taux publication"
              value={`${stats.publishRate}%`}
              sub={`${stats.publishedRecordings} publiés`}
              subColor="text-green-500"
            />
          </div>

          {/* États des enregistrements */}
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              Répartition par état BBB
            </h2>
            <div className="grid grid-cols-5 gap-3">
              <StateCard
                label="En traitement"
                value={stats.byState.processing}
                color="bg-purple-50 border-purple-100 text-purple-700"
                description="BBB traite la vidéo"
              />
              <StateCard
                label="Traité"
                value={stats.byState.processed}
                color="bg-orange-50 border-orange-100 text-orange-700"
                description="Prêt à publier"
              />
              <StateCard
                label="Publié"
                value={stats.byState.published}
                color="bg-green-50 border-green-100 text-green-700"
                description="Accessible"
              />
              <StateCard
                label="Dé-publié"
                value={stats.byState.unpublished}
                color="bg-yellow-50 border-yellow-100 text-yellow-700"
                description="Retiré de la lecture"
              />
              <StateCard
                label="Supprimé"
                value={stats.byState.deleted}
                color="bg-red-50 border-red-100 text-red-700"
                description="Marqué pour suppression"
              />
            </div>
          </div>

          {/* Jobs de rebuild */}
          {(stats.jobs.done + stats.jobs.failed + stats.jobs.pending + stats.jobs.running) > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-gray-700 mb-3">
                Jobs de publication
              </h2>
              <div className="grid grid-cols-4 gap-3">
                <StateCard
                  label="En attente"
                  value={stats.jobs.pending}
                  color="bg-gray-50 border-gray-100 text-gray-600"
                  description="Pas encore lancés"
                />
                <StateCard
                  label="En cours"
                  value={stats.jobs.running}
                  color="bg-blue-50 border-blue-100 text-blue-700"
                  description="Actuellement traités"
                />
                <StateCard
                  label="Réussis"
                  value={stats.jobs.done}
                  color="bg-green-50 border-green-100 text-green-700"
                  description="Publiés avec succès"
                />
                <StateCard
                  label="Échoués"
                  value={stats.jobs.failed}
                  color="bg-red-50 border-red-100 text-red-700"
                  description="À réessayer"
                />
              </div>
            </div>
          )}

          {/* Tableau enregistrements non publiés */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-700">
                Enregistrements non publiés
              </h2>
              <a href="/recordings" className="text-xs text-blue-600 hover:underline">
                Voir tout
              </a>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nom</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Serveur</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Durée</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">État</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Date</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-8 text-sm">
                        Aucun enregistrement non publié
                      </td>
                    </tr>
                  ) : (
                    recent.map((rec) => {
                      const isRebuildable =
                        !rec.published &&
                        REBUILDABLE_STATES.includes(rec.state) &&
                        rec.durationSec >= MIN_RECORDING_DURATION_SEC

                      return (
                        <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 max-w-[180px] truncate">
                            <Link
                              href={`/recordings/${rec.id}`}
                              className="font-medium text-gray-800 hover:text-blue-600 transition"
                            >
                              {rec.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                              {rec.server.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {formatDuration(rec.durationSec)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              published={rec.published}
                              state={rec.state}
                              durationSec={rec.durationSec}
                            />
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {formatDate(rec.startTime)}
                          </td>
                          <td className="px-4 py-3">
                            {isRebuildable && isAdmin ? (
                              <RebuildButton recordingId={rec.id} />
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
