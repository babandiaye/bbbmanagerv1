'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon, FunnelIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { MIN_RECORDING_DURATION_SEC } from '@/lib/constants'

const REBUILDABLE_STATES = ['processed', 'unpublished']

type Recording = {
  id: string
  name: string
  durationSec: number
  published: boolean
  state: string
  startTime: string
  server: { name: string }
}

function StatusBadge({ published, state, durationSec }: {
  published: boolean
  state: string
  durationSec: number
}) {
  if (published || state === 'published') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
      Publié
    </span>
  )
  if (state === 'processing') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
      En traitement
    </span>
  )
  if (state === 'processed') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
      Traité — non publié
    </span>
  )
  if (state === 'unpublished') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
      Dé-publié
    </span>
  )
  if (state === 'deleted') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
      Supprimé
    </span>
  )
  if (durationSec < MIN_RECORDING_DURATION_SEC) return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
      Trop court
    </span>
  )
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      {state}
    </span>
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

type FilterKey = 'all' | 'unpublished' | 'rebuildable' | 'short'

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [rebuilding, setRebuilding] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  const loadRecordings = useCallback(async (p: number, f: FilterKey) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p) })
    if (f !== 'all') params.set('filter', f)
    const res = await fetch(`/api/recordings?${params}`)
    const data = await res.json()
    setRecordings(data.recordings)
    setTotal(data.total)
    setTotalPages(data.totalPages)
    setLoading(false)
  }, [])

  useEffect(() => { loadRecordings(page, filter) }, [page, filter, loadRecordings])

  function changeFilter(f: FilterKey) {
    setFilter(f)
    setPage(1)
  }

  async function handleSync() {
    setSyncing(true)
    setMessage('')
    const res = await fetch('/api/recordings/sync', { method: 'POST' })
    const data = await res.json()
    setMessage(`Sync terminée — ${data.synced} enregistrements mis à jour`)
    await loadRecordings(1, filter)
    setPage(1)
    setSyncing(false)
  }

  async function handleRebuild(recordingId: string) {
    setRebuilding(recordingId)
    setMessage('')
    const res = await fetch('/api/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId }),
    })
    const data = await res.json()
    if (res.ok) {
      setMessage('Publication lancée avec succès')
      await loadRecordings(page, filter)
    } else {
      setMessage(`Erreur : ${data.error}`)
    }
    setRebuilding(null)
  }

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all',         label: 'Tous' },
    { key: 'unpublished', label: 'Non publiés' },
    { key: 'rebuildable', label: 'Publiables' },
    { key: 'short',       label: 'Trop courts' },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Enregistrements</h1>
          <p className="text-sm text-gray-400">{total} enregistrement(s)</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisation...' : 'Synchroniser'}
        </button>
      </div>

      {/* Message feedback */}
      {message && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3">
          {message}
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-2 mb-4">
        <FunnelIcon className="w-4 h-4 text-gray-400" />
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => changeFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              filter === key
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-2">{total} résultat(s)</span>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Aucun enregistrement</div>
        ) : (
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
              {recordings.map((rec) => {
                const isRebuildable =
                  !rec.published &&
                  REBUILDABLE_STATES.includes(rec.state) &&
                  rec.durationSec >= MIN_RECORDING_DURATION_SEC

                return (
                  <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="px-4 py-3 max-w-[200px] truncate font-medium text-gray-800">
                      {rec.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {rec.server.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDuration(rec.durationSec)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        published={rec.published}
                        state={rec.state}
                        durationSec={rec.durationSec}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(rec.startTime)}</td>
                    <td className="px-4 py-3">
                      {isRebuildable ? (
                        <button
                          onClick={() => handleRebuild(rec.id)}
                          disabled={rebuilding === rec.id}
                          className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          {rebuilding === rec.id ? 'En cours...' : 'Publier'}
                        </button>
                      ) : rec.state === 'processing' ? (
                        <span className="text-xs text-purple-500">En cours...</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            Page {page} sur {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 transition disabled:opacity-30"
            >
              <ChevronLeftIcon className="w-3 h-3" />
              Précédent
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 transition disabled:opacity-30"
            >
              Suivant
              <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
