'use client'

import { useEffect, useState } from 'react'
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'

type SyncStatus = {
  hasData: boolean
  hasErrors?: boolean
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  synced?: number
  errors?: string[]
  serversProcessed?: number
}

export default function SyncStatusBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch('/api/sync-status')
      .then(r => r.ok ? r.json() : null)
      .then(setStatus)
      .catch(() => {})

    // Rafraîchit toutes les 5 min pour détecter les nouveaux échecs
    const interval = setInterval(() => {
      fetch('/api/sync-status')
        .then(r => r.ok ? r.json() : null)
        .then((s) => {
          if (s && s.finishedAt !== status?.finishedAt) {
            setStatus(s)
            setDismissed(false)
          }
        })
        .catch(() => {})
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!status?.hasData || !status.hasErrors || dismissed) return null

  const time = status.finishedAt
    ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(status.finishedAt))
    : ''

  return (
    <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-3">
      <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">
          Dernière synchronisation automatique en erreur{time && ` (${time})`}
        </p>
        <ul className="mt-1 text-xs text-red-700 space-y-0.5">
          {status.errors!.map((err, i) => (
            <li key={i} className="truncate">• {err}</li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-red-400 hover:text-red-600 transition flex-shrink-0"
        title="Masquer"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
