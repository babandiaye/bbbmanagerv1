'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  FilmIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

type Platform = { id: string; name: string; url: string; siteName: string | null; isActive: boolean }

type SearchType = 'cmid' | 'recordId'

type EnrichedRecording = {
  recordId: string
  name: string
  startTimeMs: number | null
  durationMin: number | null
  source: 'moodle_only' | 'bbb_only' | 'both'
  moodle?: {
    moodleId: string
    publishedOnMoodle: boolean
    imported: boolean
    playbackUrls: string[]
  }
  bbb?: {
    id: string
    state: string
    published: boolean
    durationSec: number
    startTime: string
    playbackUrl: string | null
    serverName: string
    serverUrl: string
  }
  rebuildCommand?: string
}

type SearchResponse = {
  platform: { id: string; name: string; siteName: string | null; url: string; bbbOriginServerName: string | null }
  input: { type: SearchType; value: string }
  courses: Array<{ id: number; shortname: string; fullname: string }>
  activities: Array<{ id: number; course: number; name: string; meetingid: string }>
  probableServer: { name: string; url: string } | null
  recordings: EnrichedRecording[]
  summary: { total: number; synced: number; moodleOnly: number; bbbOnly: number }
  warning?: string
}

const SEARCH_TYPES: Array<{ value: SearchType; label: string; placeholder: string; help: string }> = [
  {
    value: 'cmid',
    label: 'ID du module (cmid)',
    placeholder: '143',
    help: 'L\'ID numérique de l\'activité Moodle (le « id » dans /mod/bigbluebuttonbn/view.php?id=143).',
  },
  {
    value: 'recordId',
    label: 'Record ID BBB',
    placeholder: 'abc123def...-1773327151076',
    help: 'L\'identifiant complet d\'un enregistrement BBB (40 caractères hex + tiret + timestamp).',
  },
]

/** Validation client (miroir de la validation serveur) */
function validateClient(type: SearchType, value: string): string | null {
  const v = value.trim()
  if (!v) return 'Champ requis'
  switch (type) {
    case 'cmid':
      if (!/^\d{1,10}$/.test(v)) return 'Doit être un nombre entier (ex: 143)'
      return null
    case 'recordId':
      if (!/^[a-f0-9]{40}-\d{10,13}$/.test(v)) return 'Format attendu : 40 chars hex + tiret + timestamp'
      return null
  }
}

function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms))
}

function StateBadge({ state, published }: { state: string; published: boolean }) {
  if (published || state === 'published') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Publié</span>
  if (state === 'processing')  return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">En traitement</span>
  if (state === 'processed')   return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">Traité — non publié</span>
  if (state === 'unpublished') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">Dé-publié</span>
  if (state === 'deleted')     return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">Supprimé</span>
  return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{state}</span>
}

function SourceBadge({ source }: { source: EnrichedRecording['source'] }) {
  if (source === 'both') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700"><CheckCircleIcon className="w-3 h-3"/>Moodle + BBB</span>
  if (source === 'moodle_only') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700"><ExclamationTriangleIcon className="w-3 h-3"/>Moodle seul</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">BBB seul</span>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
      {copied ? 'Copié !' : 'Copier'}
    </button>
  )
}

export default function MoodleSearchPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [platformId, setPlatformId] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('cmid')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/moodle-platforms')
      .then(r => r.json())
      .then((data: Platform[]) => {
        const active = data.filter(p => p.isActive)
        setPlatforms(active)
        if (active.length > 0) setPlatformId(active[0].id)
      })
  }, [])

  const currentPlatform = useMemo(() => platforms.find(p => p.id === platformId), [platforms, platformId])
  const typeMeta = useMemo(() => SEARCH_TYPES.find(t => t.value === searchType)!, [searchType])
  const validationError = useMemo(() => validateClient(searchType, value), [searchType, value])

  // Pour cmid : on génère l'URL Moodle complète (purement informatif, jamais utilisée pour un fetch)
  const generatedMoodleUrl = useMemo(() => {
    if (searchType !== 'cmid' || !currentPlatform || !value || validationError) return null
    return `${currentPlatform.url}/mod/bigbluebuttonbn/view.php?id=${value}`
  }, [searchType, currentPlatform, value, validationError])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!platformId || validationError) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const params = new URLSearchParams({ platformId, type: searchType, value: value.trim() })
      const res = await fetch(`/api/moodle-search?${params}`)
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Erreur de recherche')
      else setResult(data)
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  function handleTypeChange(t: SearchType) {
    setSearchType(t)
    setValue('')
    setResult(null)
    setError('')
  }

  if (platforms.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg p-6 text-center">
          <AcademicCapIcon className="w-10 h-10 mx-auto mb-2 text-yellow-600" />
          <p className="font-medium mb-1">Aucune plateforme Moodle active</p>
          <p className="text-xs">
            Ajoutez une plateforme depuis <Link href="/moodle-platforms" className="underline">Plateformes Moodle</Link> pour commencer.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Diagnostic Moodle ↔ BBB</h1>
        <p className="text-sm text-gray-400">
          Choisissez un critère de recherche, saisissez la valeur, le système croise les données Moodle et BBB Manager pour identifier les enregistrements à rebuilder.
        </p>
      </div>

      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-3">
            <label className="block text-xs text-gray-500 mb-1">Plateforme Moodle</label>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-300">
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-gray-500 mb-1">Type de recherche</label>
            <select value={searchType} onChange={(e) => handleTypeChange(e.target.value as SearchType)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-300">
              {SEARCH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="col-span-4">
            <label className="block text-xs text-gray-500 mb-1">Valeur</label>
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={typeMeta.placeholder}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none ${
                validationError && value
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-300'
              } font-mono`}
              required maxLength={100} />
          </div>
          <div className="col-span-2 flex items-end">
            <button type="submit" disabled={loading || !!validationError}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
              <MagnifyingGlassIcon className="w-4 h-4" />
              {loading ? '...' : 'Chercher'}
            </button>
          </div>
        </div>

        {/* Aide contextuelle + erreur de validation + URL générée pour cmid */}
        <div className="text-xs space-y-1">
          <p className="text-gray-400">{typeMeta.help}</p>
          {value && validationError && <p className="text-red-500">{validationError}</p>}
          {generatedMoodleUrl && (
            <p className="text-gray-500 inline-flex items-center gap-1">
              Page Moodle correspondante :&nbsp;
              <a href={generatedMoodleUrl} target="_blank" rel="noopener noreferrer"
                 className="text-blue-600 hover:underline inline-flex items-center gap-0.5 font-mono">
                {generatedMoodleUrl}
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            </p>
          )}
        </div>
      </form>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {result && (
        <>
          {/* Warning : pas de filtre par plateforme configuré */}
          {result.warning && (
            <div className="bg-orange-50 border border-orange-200 text-orange-800 text-sm rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{result.warning}</p>
                <p className="text-xs mt-1">
                  Aller dans <Link href="/moodle-platforms" className="underline">Plateformes Moodle</Link> et renseigner le champ &quot;Origine BBB&quot; pour cette plateforme.
                </p>
              </div>
            </div>
          )}

          {/* Bandeau contexte */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 text-xs text-blue-900">
            {result.courses.length > 0 && <>Cours : <strong>{result.courses[0].shortname}</strong> ({result.courses[0].fullname})</>}
            {result.activities.length > 0 && (
              <> {result.courses.length > 0 ? '— ' : ''}
                {result.activities.length === 1
                  ? <>Activité : <strong>{result.activities[0].name}</strong></>
                  : <><strong>{result.activities.length}</strong> activités BBB trouvées</>
                }
              </>
            )}
            {result.platform.bbbOriginServerName && (
              <> — <span className="font-mono text-[10px] bg-blue-100 px-1.5 py-0.5 rounded">{result.platform.bbbOriginServerName}</span></>
            )}
          </div>

          {/* Résumé */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-1">Total</p>
              <p className="text-2xl font-semibold text-gray-900">{result.summary.total}</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-lg p-4">
              <p className="text-xs text-green-700 mb-1">Moodle + BBB</p>
              <p className="text-2xl font-semibold text-green-700">{result.summary.synced}</p>
              <p className="text-[10px] text-green-600 mt-0.5">Sync OK</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
              <p className="text-xs text-orange-700 mb-1">Moodle seul</p>
              <p className="text-2xl font-semibold text-orange-700">{result.summary.moodleOnly}</p>
              <p className="text-[10px] text-orange-600 mt-0.5">À rebuilder</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs text-blue-700 mb-1">BBB seul</p>
              <p className="text-2xl font-semibold text-blue-700">{result.summary.bbbOnly}</p>
              <p className="text-[10px] text-blue-600 mt-0.5">Pas sur Moodle</p>
            </div>
          </div>

          {/* Alerte orphelins */}
          {result.summary.moodleOnly > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-orange-900">
                    {result.summary.moodleOnly} enregistrement(s) visible(s) sur Moodle mais absent(s) de la base BBB Manager.
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    Lancer <code className="font-mono bg-orange-100 px-1 rounded">bbb-record --rebuild &lt;recordId&gt;</code> sur le serveur BBB
                    {result.probableServer && <> (probablement <strong>{result.probableServer.name}</strong>)</>}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tableau */}
          <section>
            <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <FilmIcon className="w-4 h-4 text-gray-400" />
              Enregistrements ({result.recordings.length})
            </h2>
            {result.recordings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 text-center py-10 text-gray-400 text-sm">
                Aucun enregistrement trouvé.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Record ID</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Serveur BBB</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Date</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Durée</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">Source</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">État Moodle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.recordings.map((r) => (
                      <tr key={r.recordId} className={`border-t border-gray-50 hover:bg-gray-50 transition ${r.source === 'moodle_only' ? 'bg-orange-50/30' : ''}`}>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-700 break-all">{r.recordId}</td>
                        <td className="px-3 py-2">
                          {r.bbb ? (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-medium">{r.bbb.serverName}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.startTimeMs)}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{r.durationMin ? `${r.durationMin} min` : '—'}</td>
                        <td className="px-3 py-2"><SourceBadge source={r.source} /></td>
                        <td className="px-3 py-2">
                          {r.moodle ? (
                            r.moodle.publishedOnMoodle
                              ? <span className="text-xs text-green-700">Publié</span>
                              : <span className="text-xs text-gray-500">Non publié</span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
