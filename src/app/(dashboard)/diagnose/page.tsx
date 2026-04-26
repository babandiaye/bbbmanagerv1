'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowUpTrayIcon,
  DocumentTextIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'

type DiagnosisResult = {
  recordId: string
  found: boolean
  source: 'db' | 'bbb_api' | 'raw' | 'inferred' | 'not_found'
  server?: { name: string; url: string }
  state?: string
  published?: boolean
  durationMin?: number
  startTimeMs?: number
  name?: string
  contextName?: string
  contextLabel?: string
  contextId?: string
  rebuildCommand?: string
  bbbRecordingDbId?: string
  message?: string
  rawAnalysis?: {
    participantCount: number
    participantNames: string[]
    chatMessageCount: number
    hasScreenShare: boolean
    hasWebcam: boolean
    isRebuildable: boolean
    rebuildReasons: string[]
  }
}

type Summary = {
  total: number
  inDb: number
  apiOnly: number
  raw: number
  inferred: number
  notFound: number
  rebuildable: number
}

function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
      {copied ? 'Copié !' : label}
    </button>
  )
}

function formatDate(ms?: number): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms))
}

function StateBadge({ state, published }: { state?: string; published?: boolean }) {
  if (!state) return <span className="text-xs text-gray-300">—</span>
  if (published || state === 'published') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Publié</span>
  if (state === 'processing')  return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">En traitement</span>
  if (state === 'processed')   return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">Traité — non publié</span>
  if (state === 'unpublished') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">Dé-publié</span>
  if (state === 'deleted')     return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">Supprimé</span>
  return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{state}</span>
}

function SourceIcon({ source }: { source: DiagnosisResult['source'] }) {
  if (source === 'db') return <CheckCircleIcon className="w-4 h-4 text-green-600" />
  if (source === 'bbb_api') return <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />
  if (source === 'raw') return <ExclamationTriangleIcon className="w-4 h-4 text-purple-500" />
  if (source === 'inferred') return <ExclamationTriangleIcon className="w-4 h-4 text-blue-500" />
  return <XCircleIcon className="w-4 h-4 text-red-500" />
}

export default function DiagnosePage() {
  const [ids, setIds] = useState<string[]>([])
  const [textInput, setTextInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<DiagnosisResult[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function parseIds(text: string): string[] {
    return text
      .split(/[\n,;]+/)
      .map(id => id.trim())
      .filter(Boolean)
      .filter((id, i, arr) => arr.indexOf(id) === i)
  }

  function handleTextChange(value: string) {
    setTextInput(value)
    setIds(parseIds(value))
    setResults(null)
    setSummary(null)
    setError('')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      setTextInput(content)
      setIds(parseIds(content))
      setResults(null)
      setSummary(null)
      setError('')
    }
    reader.readAsText(file)
  }

  async function handleSubmit() {
    if (ids.length === 0) {
      setError('Aucun ID à analyser')
      return
    }
    if (ids.length > 200) {
      setError('Maximum 200 IDs par requête')
      return
    }
    setProcessing(true)
    setError('')
    setResults(null)
    setSummary(null)
    try {
      const res = await fetch('/api/diagnose-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: ids }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur serveur')
        if (data.invalidIds?.length) {
          setError(`${data.error}\nIDs invalides : ${data.invalidIds.slice(0, 5).join(', ')}${data.invalidIds.length > 5 ? '...' : ''}`)
        }
      } else {
        setSummary(data.summary)
        setResults(data.results)
      }
    } catch {
      setError('Erreur de connexion au serveur')
    } finally {
      setProcessing(false)
    }
  }

  function reset() {
    setIds([])
    setTextInput('')
    setResults(null)
    setSummary(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // Toutes les commandes rebuild groupées par serveur (pour copier en bloc)
  const rebuildCommandsByServer: Record<string, string[]> = {}
  if (results) {
    for (const r of results) {
      if (r.server && r.rebuildCommand) {
        const key = r.server.name
        if (!rebuildCommandsByServer[key]) rebuildCommandsByServer[key] = []
        rebuildCommandsByServer[key].push(r.rebuildCommand)
      }
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Diagnostic d&apos;enregistrements</h1>
        <p className="text-sm text-gray-400">
          Collez ou importez une liste de record IDs BBB. Le système identifie pour chacun
          le serveur BBB d&apos;origine et l&apos;état actuel. <strong>Aucune action n&apos;est exécutée</strong>,
          le rebuild se fait manuellement via SSH.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Importer un fichier CSV</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition">
              <ArrowUpTrayIcon className="w-8 h-8 text-gray-300 mb-2" />
              <span className="text-xs text-gray-500">Cliquez ou glissez un fichier</span>
              <span className="text-[10px] text-gray-400 mt-1">CSV ou TXT, un ID par ligne</span>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Ou coller les record IDs</label>
            <textarea
              value={textInput}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={"abc123...40hex...-1773327151076\ndef456...40hex...-1773327151077\n..."}
              className="w-full h-[140px] text-xs border border-gray-200 rounded-lg p-3 font-mono text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
            />
          </div>
        </div>

        {ids.length > 0 && !results && (
          <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-blue-700">
                <strong>{ids.length}</strong> record ID(s) détecté(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={reset} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition">
                Effacer
              </button>
              <button onClick={handleSubmit} disabled={processing}
                className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50">
                {processing ? 'Analyse en cours...' : 'Analyser'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 whitespace-pre-line">
            {error}
          </div>
        )}
      </div>

      {summary && results && (
        <>
          {/* Cartes résumé */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-semibold text-gray-800">{summary.total}</p>
              <p className="text-xs text-gray-400 mt-1">Total</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
              <p className="text-2xl font-semibold text-green-700">{summary.inDb}</p>
              <p className="text-xs text-green-600 mt-1">En base</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-center">
              <p className="text-2xl font-semibold text-orange-700">{summary.apiOnly}</p>
              <p className="text-xs text-orange-600 mt-1">API BBB</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-center">
              <p className="text-2xl font-semibold text-purple-700">{summary.raw}</p>
              <p className="text-xs text-purple-600 mt-1">events.xml</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
              <p className="text-2xl font-semibold text-blue-700">{summary.inferred}</p>
              <p className="text-xs text-blue-600 mt-1">Serveur déduit</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-center">
              <p className="text-2xl font-semibold text-red-700">{summary.notFound}</p>
              <p className="text-xs text-red-600 mt-1">Introuvables</p>
            </div>
          </div>

          {summary.rebuildable > 0 && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
              ✓ <strong>{summary.rebuildable}</strong> enregistrement(s) identifié(s) comme <strong>rebuildables</strong> (critères : durée ≥ 15 min ET ≥ 2 participants).
            </div>
          )}

          {/* Bloc commandes groupées par serveur */}
          {Object.keys(rebuildCommandsByServer).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
              <h2 className="text-sm font-medium text-gray-700 mb-3">Commandes de rebuild groupées par serveur</h2>
              <div className="space-y-3">
                {Object.entries(rebuildCommandsByServer).map(([serverName, cmds]) => (
                  <div key={serverName} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">
                        {serverName} <span className="text-gray-400 font-normal">({cmds.length} cmd)</span>
                      </span>
                      <CopyButton text={cmds.join('\n')} label="Copier toutes" />
                    </div>
                    <pre className="text-[11px] font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
                      {cmds.join('\n')}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tableau détaillé */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2 w-8"></th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Record ID</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Serveur BBB</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Date</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Cours</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">État BBB</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Action / Note</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-t border-gray-50 ${
                    r.source === 'not_found' ? 'bg-red-50/30' :
                    r.source === 'bbb_api' ? 'bg-orange-50/30' :
                    r.source === 'raw' ? 'bg-purple-50/30' :
                    r.source === 'inferred' ? 'bg-blue-50/30' : ''
                  }`}>
                    <td className="px-3 py-2"><SourceIcon source={r.source} /></td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-700 break-all max-w-[220px]" title={r.recordId}>{r.recordId}</td>
                    <td className="px-3 py-2">
                      {r.server ? (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-medium">{r.server.name}</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.startTimeMs)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {r.contextLabel ? (
                        <span className="font-mono">{r.contextLabel}</span>
                      ) : r.contextName ?? '—'}
                    </td>
                    <td className="px-3 py-2"><StateBadge state={r.state} published={r.published} /></td>
                    <td className="px-3 py-2 text-xs">
                      {r.source === 'db' && r.bbbRecordingDbId && (
                        <Link href={`/recordings/${r.bbbRecordingDbId}`} className="text-blue-600 hover:underline">
                          Voir détails
                        </Link>
                      )}
                      {r.source === 'bbb_api' && r.message && (
                        <span className="text-orange-700">{r.message}</span>
                      )}
                      {r.source === 'raw' && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {r.rawAnalysis?.isRebuildable ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">✓ Rebuildable</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 text-gray-600">Session vide</span>
                            )}
                          </div>
                          {r.rawAnalysis && (
                            <div className="text-[10px] text-gray-600 flex flex-wrap gap-x-2">
                              <span>{r.rawAnalysis.participantCount} part.</span>
                              {r.rawAnalysis.chatMessageCount > 0 && <span>{r.rawAnalysis.chatMessageCount} chat</span>}
                              {r.rawAnalysis.hasScreenShare && <span>écran</span>}
                              {r.rawAnalysis.hasWebcam && <span>webcam</span>}
                            </div>
                          )}
                          {r.rawAnalysis?.rebuildReasons && r.rawAnalysis.rebuildReasons.length > 0 && (
                            <p className="text-[10px] text-purple-700">{r.rawAnalysis.rebuildReasons.join(' · ')}</p>
                          )}
                        </div>
                      )}
                      {r.source === 'inferred' && r.message && (
                        <span className="text-blue-700">{r.message}</span>
                      )}
                      {r.source === 'not_found' && r.message && (
                        <span className="text-red-700">{r.message}</span>
                      )}
                      {r.rebuildCommand && r.server && (
                        <div className="mt-1">
                          <CopyButton text={r.rebuildCommand} label="Copier rebuild" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-center">
            <button onClick={reset} className="text-xs px-4 py-2 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition">
              Nouveau diagnostic
            </button>
          </div>
        </>
      )}
    </div>
  )
}
