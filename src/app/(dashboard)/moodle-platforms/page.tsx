'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
import { useCurrentUser } from '@/hooks/useCurrentUser'

type Platform = {
  id: string
  name: string
  url: string
  serviceName: string | null
  wsUsername: string | null
  siteName: string | null
  lastCheckAt: string | null
  isActive: boolean
  createdAt: string
}

export default function MoodlePlatformsPage() {
  const { isAdmin } = useCurrentUser()
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', token: '', serviceName: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function loadPlatforms() {
    setLoading(true)
    const res = await fetch('/api/moodle-platforms')
    const data = await res.json()
    setPlatforms(data)
    setLoading(false)
  }

  useEffect(() => { loadPlatforms() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/moodle-platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'ajout')
      } else {
        setMessage(
          `Plateforme "${data.name}" ajoutée. Connecté en tant que ${data.wsUser} (${data.sitename}).`,
        )
        setForm({ name: '', url: '', token: '', serviceName: '' })
        setShowForm(false)
        loadPlatforms()
      }
    } catch {
      setError('Erreur de connexion au serveur')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/moodle-platforms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    loadPlatforms()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer la plateforme Moodle "${name}" ?\n\nSeule la configuration locale est supprimée.\nAucune donnée n'est touchée côté Moodle.`)) return

    setDeleting(id)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/moodle-platforms/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Suppression impossible')
      } else {
        setMessage(`Plateforme "${data.name}" supprimée.`)
        await loadPlatforms()
      }
    } catch {
      setError('Erreur de connexion au serveur')
    } finally {
      setDeleting(null)
    }
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(date))
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Plateformes Moodle</h1>
          <p className="text-sm text-gray-400">{platforms.length} plateforme(s) configurée(s)</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(!showForm); setError(''); setMessage('') }}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <PlusIcon className="w-4 h-4" />
            Ajouter une plateforme
          </button>
        )}
      </div>

      {/* Messages globaux */}
      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          {message}
        </div>
      )}
      {error && !showForm && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Formulaire ajout */}
      {showForm && isAdmin && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-xl border border-gray-100 p-5 mb-6"
        >
          <h2 className="text-sm font-medium text-gray-700 mb-4">Nouvelle plateforme Moodle</h2>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom</label>
              <input
                type="text"
                placeholder="P11STN"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL Moodle</label>
              <input
                type="url"
                placeholder="https://moodlep11stn.unchk.sn"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Token Web Service</label>
              <input
                type="password"
                placeholder="token Moodle"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Nom du service Moodle <span className="text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text"
              placeholder="BBBManagerDISIDEV"
              value={form.serviceName}
              onChange={(e) => setForm({ ...form, serviceName: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Nom du service configuré dans Moodle (Site administration → Services web → Services externes). Utile pour retrouver la config plus tard.
            </p>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            L&apos;URL doit être l&apos;adresse de base de Moodle (sans <code className="font-mono">/webservice/rest/server.php</code>). La connexion est testée avant enregistrement.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Test connexion...' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      {/* Liste en cartes */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 text-center py-12 text-gray-400 text-sm">
          Chargement...
        </div>
      ) : platforms.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 text-center py-12 text-gray-400 text-sm">
          <AcademicCapIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          Aucune plateforme Moodle configurée
        </div>
      ) : (
        <div className="space-y-3">
          {platforms.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200 transition"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <AcademicCapIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                    {p.siteName && (
                      <p className="text-xs text-gray-500 truncate">{p.siteName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isAdmin ? (
                    <button
                      onClick={() => handleToggle(p.id, p.isActive)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        p.isActive
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {p.isActive ? 'Actif' : 'Inactif'}
                    </button>
                  ) : (
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deleting === p.id}
                      className="text-gray-300 hover:text-red-500 transition disabled:opacity-30 disabled:cursor-wait p-1"
                      title={`Supprimer ${p.name}`}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div>
                  <p className="text-gray-400 mb-0.5">URL</p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 font-mono hover:text-blue-600 hover:underline break-all"
                  >
                    {p.url}
                  </a>
                </div>
                {p.serviceName && (
                  <div>
                    <p className="text-gray-400 mb-0.5">Service Moodle</p>
                    <p className="text-gray-700 font-mono">{p.serviceName}</p>
                  </div>
                )}
                {p.wsUsername && (
                  <div>
                    <p className="text-gray-400 mb-0.5">Utilisateur Web Service</p>
                    <p className="text-gray-700 font-mono">{p.wsUsername}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 mb-0.5">Ajoutée le</p>
                  <p className="text-gray-700">{formatDate(p.createdAt)}</p>
                </div>
                {p.lastCheckAt && (
                  <div>
                    <p className="text-gray-400 mb-0.5">Dernière vérification</p>
                    <p className="text-gray-700">{formatDate(p.lastCheckAt)}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
