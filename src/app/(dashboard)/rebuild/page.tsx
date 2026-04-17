'use client'

import { useState, useRef } from 'react'
import { ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { useCurrentUser } from '@/hooks/useCurrentUser'

type ResultItem = {
  recordId: string
  server: string
  status: 'success' | 'error' | 'not_found' | 'already_published' | 'skipped'
  message: string
}

type Summary = {
  total: number
  success: number
  alreadyPublished: number
  errors: number
  notFound: number
  skipped: number
}

const statusConfig: Record<string, { label: string; color: string }> = {
  success:           { label: 'Publié',          color: 'bg-green-50 text-green-700' },
  already_published: { label: 'Déjà publié',     color: 'bg-gray-100 text-gray-600' },
  error:             { label: 'Erreur',           color: 'bg-red-50 text-red-700' },
  not_found:         { label: 'Non trouvé',       color: 'bg-yellow-50 text-yellow-700' },
  skipped:           { label: 'Ignoré',           color: 'bg-gray-100 text-gray-500' },
}

export default function RebuildBatchPage() {
  const { isAdmin, loading: userLoading } = useCurrentUser()
  const [ids, setIds] = useState<string[]>([])
  const [textInput, setTextInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<ResultItem[] | null>(null)
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
      setError('Aucun ID à traiter')
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
      const res = await fetch('/api/rebuild-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: ids }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erreur serveur')
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

  if (!userLoading && !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-8 text-center">
          <p className="font-medium">Accès refusé</p>
          <p className="text-xs mt-1">Cette page est réservée aux administrateurs.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Publication en masse</h1>
        <p className="text-sm text-gray-400">
          Importez un fichier CSV ou collez une liste de record IDs pour les publier automatiquement.
          Chaque ID est mappé à son serveur BBB.
        </p>
      </div>

      {/* Zone d'import */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Upload CSV */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Importer un fichier CSV
            </label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition">
              <ArrowUpTrayIcon className="w-8 h-8 text-gray-300 mb-2" />
              <span className="text-xs text-gray-500">Cliquez ou glissez un fichier</span>
              <span className="text-[10px] text-gray-400 mt-1">CSV ou TXT, un ID par ligne</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Saisie manuelle */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Ou coller les record IDs
            </label>
            <textarea
              value={textInput}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={"e9a7c2ff35b3b274...-1756547689719\nabc123def456...-1756547689720\n..."}
              className="w-full h-[140px] text-xs border border-gray-200 rounded-lg p-3 font-mono text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
            />
          </div>
        </div>

        {/* Résumé pré-soumission */}
        {ids.length > 0 && !results && (
          <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-blue-700">
                <strong>{ids.length}</strong> record ID(s) détecté(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={reset}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition"
              >
                Effacer
              </button>
              <button
                onClick={handleSubmit}
                disabled={processing}
                className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50"
              >
                {processing ? 'Publication en cours...' : 'Lancer la publication'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {/* Résultats */}
      {summary && results && (
        <div>
          {/* Résumé */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-gray-800">{summary.total}</p>
              <p className="text-[10px] text-gray-400">Total</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-green-700">{summary.success}</p>
              <p className="text-[10px] text-green-600">Publiés</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-gray-600">{summary.alreadyPublished}</p>
              <p className="text-[10px] text-gray-400">Déjà publiés</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-red-700">{summary.errors}</p>
              <p className="text-[10px] text-red-500">Erreurs</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-yellow-700">{summary.notFound}</p>
              <p className="text-[10px] text-yellow-600">Non trouvés</p>
            </div>
          </div>

          {/* Tableau détaillé */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Record ID</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Serveur</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Statut</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const cfg = statusConfig[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-[250px] truncate">
                        {r.recordId}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {r.server}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-[250px] truncate">
                        {r.message}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bouton recommencer */}
          <div className="mt-4 text-center">
            <button
              onClick={reset}
              className="text-xs px-4 py-2 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition"
            >
              Nouvelle importation
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
