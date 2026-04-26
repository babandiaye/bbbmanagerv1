'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  FilmIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

type Platform = { id: string; name: string; url: string; siteName: string | null; isActive: boolean }

type SearchType = 'cmid' | 'recordId'

type UnifiedRecording = {
  recordId: string
  startTimeMs: number | null
  durationMin: number | null
  participantCount?: number
  chatMessageCount?: number
  hasScreenShare?: boolean
  hasWebcam?: boolean
  publishedOnMoodle: boolean
  publishedOnBbb: boolean
  inRaw: boolean
  isRebuildable: boolean
  rebuildReasons: string[]
  server?: { name: string; url: string }
  bbbState?: string
  bbbRecordingDbId?: string
  rebuildCommand?: string
}

type SearchResponse = {
  platform: { id: string; name: string; siteName: string | null; url: string; bbbOriginServerName: string | null }
  input: { type: SearchType; value: string }
  courses: Array<{ id: number; shortname: string; fullname: string }>
  activities: Array<{ id: number; course: number; name: string; meetingid: string }>
  activityMeetingPrefix: string | null
  recordings: UnifiedRecording[]
  summary: { total: number; publishedBoth: number; onlyRaw: number; rebuildable: number; rawMissing: number }
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

type SourceKind = 'both' | 'moodle_only' | 'bbb_only' | 'raw_only' | 'unknown'

function sourceOf(r: UnifiedRecording): SourceKind {
  if (r.publishedOnMoodle && r.publishedOnBbb) return 'both'
  if (r.publishedOnMoodle && !r.publishedOnBbb) return 'moodle_only'
  if (!r.publishedOnMoodle && r.publishedOnBbb) return 'bbb_only'
  if (r.inRaw) return 'raw_only'
  return 'unknown'
}

function SourceBadge({ source }: { source: SourceKind }) {
  if (source === 'both') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700"><CheckCircleIcon className="w-3 h-3"/>Moodle + BBB</span>
  if (source === 'moodle_only') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700"><ExclamationTriangleIcon className="w-3 h-3"/>Moodle seul</span>
  if (source === 'bbb_only') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">BBB seul</span>
  if (source === 'raw_only') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">Raw seul</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-400">—</span>
}

function StatusCell({ r }: { r: UnifiedRecording }) {
  if (r.publishedOnMoodle) {
    return <span className="text-xs text-green-700 font-medium">Publié</span>
  }
  if (r.isRebuildable) {
    return (
      <div className="flex flex-col">
        <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-medium">
          <WrenchScrewdriverIcon className="w-3.5 h-3.5" />
          Rebuildable
        </span>
        {r.rebuildReasons.length > 0 && (
          <span className="text-[10px] text-gray-400 mt-0.5">{r.rebuildReasons.join(', ')}</span>
        )}
      </div>
    )
  }
  return <span className="text-xs text-gray-400">Non publié</span>
}

function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
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
      title={label}
    >
      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
      {copied && <span>Copié !</span>}
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

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [onlyRebuildable, setOnlyRebuildable] = useState(false)

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

  const generatedMoodleUrl = useMemo(() => {
    if (searchType !== 'cmid' || !currentPlatform || !value || validationError) return null
    return `${currentPlatform.url}/mod/bigbluebuttonbn/view.php?id=${value}`
  }, [searchType, currentPlatform, value, validationError])

  const filteredRecordings = useMemo(() => {
    if (!result) return []
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null
    const toMs = dateTo ? new Date(dateTo).getTime() + 24 * 3600 * 1000 - 1 : null
    return result.recordings.filter(r => {
      if (onlyRebuildable && !r.isRebuildable) return false
      if (fromMs !== null && (r.startTimeMs ?? 0) < fromMs) return false
      if (toMs !== null && (r.startTimeMs ?? Infinity) > toMs) return false
      return true
    })
  }, [result, dateFrom, dateTo, onlyRebuildable])

  // Comptes dérivés (sur la liste complète, pas filtrée)
  const counts = useMemo(() => {
    if (!result) return null
    const c = { total: 0, both: 0, moodleOnly: 0, bbbOnly: 0, rawOnly: 0 }
    for (const r of result.recordings) {
      c.total++
      const s = sourceOf(r)
      if (s === 'both') c.both++
      else if (s === 'moodle_only') c.moodleOnly++
      else if (s === 'bbb_only') c.bbbOnly++
      else if (s === 'raw_only') c.rawOnly++
    }
    return c
  }, [result])

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
          Choisissez un critère, le système croise Moodle, BBB Manager et les fichiers raw pour identifier les enregistrements à rebuilder.
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

      {result && counts && (
        <>
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

          {/* Résumé : 4 cartes (5 si raw_only > 0) */}
          <div className={`grid ${counts.rawOnly > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-3 mb-6`}>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-1">Total</p>
              <p className="text-2xl font-semibold text-gray-900">{counts.total}</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-lg p-4">
              <p className="text-xs text-green-700 mb-1">Moodle + BBB</p>
              <p className="text-2xl font-semibold text-green-700">{counts.both}</p>
              <p className="text-[10px] text-green-600 mt-0.5">Sync OK</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
              <p className="text-xs text-orange-700 mb-1">Moodle seul</p>
              <p className="text-2xl font-semibold text-orange-700">{counts.moodleOnly}</p>
              <p className="text-[10px] text-orange-600 mt-0.5">À rebuilder</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs text-blue-700 mb-1">BBB seul</p>
              <p className="text-2xl font-semibold text-blue-700">{counts.bbbOnly}</p>
              <p className="text-[10px] text-blue-600 mt-0.5">Pas sur Moodle</p>
            </div>
            {counts.rawOnly > 0 && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                <p className="text-xs text-purple-700 mb-1">Raw seul</p>
                <p className="text-2xl font-semibold text-purple-700">{counts.rawOnly}</p>
                <p className="text-[10px] text-purple-600 mt-0.5">Orphelins</p>
              </div>
            )}
          </div>

          {/* Filtres */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">À partir de</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jusqu&apos;à</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-300" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-1.5">
                <input type="checkbox" checked={onlyRebuildable} onChange={(e) => setOnlyRebuildable(e.target.checked)}
                  className="rounded border-gray-300" />
                Uniquement rebuildables
              </label>
              {(dateFrom || dateTo || onlyRebuildable) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setOnlyRebuildable(false) }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline pb-2"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* Tableau */}
          <section>
            <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <FilmIcon className="w-4 h-4 text-gray-400" />
              Enregistrements ({filteredRecordings.length}{filteredRecordings.length !== counts.total ? ` / ${counts.total}` : ''})
            </h2>
            {filteredRecordings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 text-center py-10 text-gray-400 text-sm">
                {counts.total === 0 ? 'Aucun enregistrement trouvé.' : 'Aucun résultat avec ces filtres.'}
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
                      <th className="text-left text-xs font-medium text-gray-400 px-3 py-2">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecordings.map((r) => {
                      const src = sourceOf(r)
                      const isOrphan = src === 'moodle_only' || src === 'raw_only'
                      return (
                        <tr key={r.recordId} className={`border-t border-gray-50 hover:bg-gray-50 transition ${isOrphan ? 'bg-orange-50/30' : ''}`}>
                          <td className="px-3 py-2 font-mono text-[11px] text-gray-700 break-all">
                            <div className="flex items-center gap-2">
                              <span>{r.recordId}</span>
                              <CopyButton text={r.recordId} label="Copier l'ID" />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {r.server ? (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-medium">{r.server.name}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.startTimeMs)}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{r.durationMin != null ? `${r.durationMin} min` : '—'}</td>
                          <td className="px-3 py-2"><SourceBadge source={src} /></td>
                          <td className="px-3 py-2"><StatusCell r={r} /></td>
                        </tr>
                      )
                    })}
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
