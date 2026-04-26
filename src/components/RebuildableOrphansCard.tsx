'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  WrenchScrewdriverIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  ServerStackIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'

type OrphanItem = {
  recordId: string
  startTimeMs: number | null
  durationSec: number | null
  participantCount: number
  chatMessageCount: number
  hasScreenShare: boolean
  hasWebcam: boolean
  bbbOriginServerName: string | null
  bbbContextName: string | null
  bbbContextLabel: string | null
  rebuildCommand: string
}

type ServerGroup = {
  id: string
  name: string
  url: string
  items: OrphanItem[]
}

type ApiResponse = {
  count: number
  days: string
  platform: string | null
  byServer: ServerGroup[]
  platforms: { name: string; count: number }[]
  lastScan: {
    startedAt: string
    finishedAt: string
    fetched: number
    inserted: number
    updated: number
    purged: number
    errors: string[]
    durationMs: number
  } | null
}

const PERIODS = [
  { value: '7', label: '7j' },
  { value: '30', label: '30j' },
  { value: '60', label: '60j' },
  { value: 'all', label: 'Tout' },
]

function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms))
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

function CopyBtn({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
      {copied ? 'Copié !' : label}
    </button>
  )
}

type SortKey = 'date' | 'duration'
type SortDir = 'asc' | 'desc'

type FlatItem = OrphanItem & { serverId: string; serverName: string }

export default function RebuildableOrphansCard({ isAdmin }: { isAdmin: boolean }) {
  const [days, setDays] = useState('30')
  const [platform, setPlatform] = useState<string>('')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ days })
    if (platform) params.set('platform', platform)
    try {
      const r = await fetch(`/api/rebuildable-orphans?${params}`)
      const json = await r.json()
      if (r.ok) setData(json)
    } finally {
      setLoading(false)
    }
  }, [days, platform])

  useEffect(() => { load() }, [load])

  async function triggerScan() {
    if (!isAdmin) return
    setScanning(true)
    try {
      const r = await fetch('/api/raw-scan', { method: 'POST' })
      if (r.ok) await load()
    } finally {
      setScanning(false)
    }
  }

  // Liste applatie avec serveur sur chaque ligne, triable globalement
  const flatItems: FlatItem[] = data
    ? data.byServer.flatMap(srv =>
        srv.items.map(i => ({ ...i, serverId: srv.id, serverName: srv.name })),
      )
    : []

  const sortedItems = [...flatItems].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'date') cmp = (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0)
    else cmp = (a.durationSec ?? 0) - (b.durationSec ?? 0)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  function exportCsv() {
    if (sortedItems.length === 0) return
    // BOM UTF-8 pour qu'Excel detecte correctement l'encodage
    const BOM = '﻿'
    const sep = ';' // separateur Excel français
    const headers = [
      'recordId',
      'serveur',
      'date',
      'duree_minutes',
      'participants',
      'chat',
      'ecran',
      'webcam',
      'cours_label',
      'cours_nom',
      'plateforme',
      'commande_rebuild',
    ]
    const escape = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      // RFC 4180 : si la valeur contient le séparateur, des quotes ou \n → entourer de quotes et doubler les quotes internes
      if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const rows = sortedItems.map(i => [
      i.recordId,
      i.serverName,
      i.startTimeMs ? new Date(i.startTimeMs).toISOString() : '',
      i.durationSec ? Math.round(i.durationSec / 60) : '',
      i.participantCount,
      i.chatMessageCount,
      i.hasScreenShare ? 'oui' : 'non',
      i.hasWebcam ? 'oui' : 'non',
      i.bbbContextLabel ?? '',
      i.bbbContextName ?? '',
      i.bbbOriginServerName ?? '',
      i.rebuildCommand,
    ].map(escape).join(sep))

    const csv = BOM + headers.join(sep) + '\n' + rows.join('\n') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    const suffix = platform ? `_${platform.replace(/[^a-z0-9]/gi, '-')}` : ''
    a.href = url
    a.download = `rebuildables_${days}j${suffix}_${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function SortHead({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 text-[10px] font-medium ${active ? 'text-gray-700' : 'text-gray-400'} hover:text-gray-700`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />
        ) : (
          <span className="w-3 h-3 opacity-30">↕</span>
        )}
      </button>
    )
  }

  const lastScan = data?.lastScan
  const lastScanLabel = lastScan
    ? `Dernier scan : ${new Date(lastScan.finishedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${lastScan.fetched} events.xml lus, ${lastScan.purged} purgés${lastScan.errors.length ? ` · ${lastScan.errors.length} erreurs` : ''}`
    : 'Aucun scan exécuté'

  return (
    <div className="bg-white rounded-xl border border-gray-100 mb-6">
      <div className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <WrenchScrewdriverIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400">
              Orphelins rebuildables
              <span className="ml-2 text-[10px] text-gray-300">(≥ 15 min, ≥ 2 part., non publiés)</span>
            </p>
            <p className="text-2xl font-semibold text-purple-700">{loading && !data ? '…' : data?.count ?? '—'}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{lastScanLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={`text-xs px-2.5 py-1 rounded-md transition ${
                  days === p.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {data && data.platforms.length > 0 && (
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-blue-300"
            >
              <option value="">Toutes plateformes</option>
              {data.platforms.map(p => (
                <option key={p.name} value={p.name}>{p.name} ({p.count})</option>
              ))}
            </select>
          )}

          <button
            onClick={exportCsv}
            disabled={!data || data.count === 0}
            className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1"
            title="Exporter la liste filtrée au format CSV"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            CSV
          </button>

          {isAdmin && (
            <button
              onClick={triggerScan}
              disabled={scanning}
              className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1"
              title="Lancer un scan manuel"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scan…' : 'Scanner'}
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            disabled={!data || data.count === 0}
            className="text-xs px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition inline-flex items-center gap-1 disabled:opacity-50"
          >
            {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
            {expanded ? 'Masquer' : 'Afficher la liste'}
          </button>
        </div>
      </div>

      {expanded && data && data.byServer.length > 0 && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Bandeau recap des copies en masse par serveur */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-400">Copier les commandes par serveur :</span>
            {data.byServer.map(srv => (
              <div key={srv.id} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-full pl-2.5 pr-1 py-0.5">
                <ServerStackIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium text-gray-700">{srv.name}</span>
                <span className="text-gray-400">({srv.items.length})</span>
                <CopyBtn
                  text={srv.items.map(i => i.rebuildCommand).join('\n')}
                  label=""
                />
              </div>
            ))}
          </div>

          {/* Tableau plat trie */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">Record ID</th>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">
                      <SortHead label="Date" k="date" />
                    </th>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">
                      <SortHead label="Durée" k="duration" />
                    </th>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">Part.</th>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">Cours</th>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">Plateforme</th>
                    <th className="text-left text-[10px] font-medium text-gray-400 px-3 py-2">Serveur BBB</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(i => (
                    <tr key={i.recordId} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 font-mono text-[10px] text-gray-700 break-all max-w-[260px]">
                        <div className="flex items-center gap-1.5">
                          <span>{i.recordId}</span>
                          <CopyBtn text={i.rebuildCommand} label="" />
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{formatDate(i.startTimeMs)}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{formatDuration(i.durationSec)}</td>
                      <td className="px-3 py-1.5 text-gray-600">{i.participantCount}</td>
                      <td className="px-3 py-1.5 text-gray-600 max-w-[180px] truncate" title={i.bbbContextName ?? ''}>
                        {i.bbbContextLabel || i.bbbContextName || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 font-mono text-[10px]">
                        {i.bbbOriginServerName ?? '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-medium">
                          <ServerStackIcon className="w-3 h-3" />
                          {i.serverName}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {expanded && data && data.count === 0 && !loading && (
        <div className="border-t border-gray-100 p-6 text-center text-sm text-gray-400">
          Aucun orphelin rebuildable détecté sur cette période.
        </div>
      )}
    </div>
  )
}
