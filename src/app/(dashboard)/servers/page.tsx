'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useCurrentUser } from '@/hooks/useCurrentUser'

type Server = {
  id: string
  name: string
  url: string
  rawIndexUrl: string | null
  hasRawIndexAuth: boolean
  isActive: boolean
  lastSyncAt: string | null
  recordings: number
}

export default function ServersPage() {
  const { isAdmin } = useCurrentUser()
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', secret: '', rawIndexUrl: '', rawIndexUser: '', rawIndexPassword: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRawUrl, setEditRawUrl] = useState('')
  const [editRawUser, setEditRawUser] = useState('')
  const [editRawPassword, setEditRawPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function loadServers() {
    setLoading(true)
    const res = await fetch('/api/servers')
    const data = await res.json()
    setServers(data)
    setLoading(false)
  }

  useEffect(() => { loadServers() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
    } else {
      setForm({ name: '', url: '', secret: '', rawIndexUrl: '', rawIndexUser: '', rawIndexPassword: '' })
      setShowForm(false)
      loadServers()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string, recordings: number) {
    const confirmMsg = recordings > 0
      ? `Supprimer le serveur "${name}" ?\n\nCette action supprimera de la base locale :\n- Le serveur\n- ${recordings} enregistrement(s) associé(s)\n- L'historique des jobs de publication\n\nLes données sur le serveur BBB réel ne seront PAS touchées.`
      : `Supprimer le serveur "${name}" ?\n\nAucun enregistrement associé en base.`

    if (!confirm(confirmMsg)) return

    setDeleting(id)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la suppression')
      } else {
        setMessage(
          data.recordingsDeleted > 0
            ? `Serveur "${data.name}" supprimé avec ${data.recordingsDeleted} enregistrement(s).`
            : `Serveur "${data.name}" supprimé.`
        )
        await loadServers()
      }
    } catch {
      setError('Erreur de connexion au serveur')
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    loadServers()
  }

  async function handleSaveRawUrl(id: string) {
    setMessage('')
    setError('')
    const body: Record<string, unknown> = {
      rawIndexUrl: editRawUrl.trim() || null,
    }
    // Si l'admin a saisi un nouveau user+password → on met à jour l'auth
    if (editRawUser.trim() && editRawPassword) {
      body.rawIndexUser = editRawUser.trim()
      body.rawIndexPassword = editRawPassword
    }
    // Si l'URL est vidée, on supprime aussi l'auth
    if (!editRawUrl.trim()) {
      body.clearRawIndexAuth = true
    }
    const res = await fetch(`/api/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Modification impossible')
    } else {
      setMessage('Index raw mis à jour.')
      setEditingId(null)
      setEditRawUrl('')
      setEditRawUser('')
      setEditRawPassword('')
      await loadServers()
    }
  }

  async function handleClearRawAuth(id: string) {
    if (!confirm('Supprimer les credentials d\'authentification de l\'index raw ?')) return
    const res = await fetch(`/api/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearRawIndexAuth: true }),
    })
    if (res.ok) {
      setMessage('Authentification raw supprimée.')
      await loadServers()
    }
  }

  function startEditRawUrl(s: Server) {
    setEditingId(s.id)
    setEditRawUrl(s.rawIndexUrl ?? '')
    setEditRawUser('')
    setEditRawPassword('')
  }

  function formatDate(date: string | null) {
    if (!date) return 'Jamais'
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(date))
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Serveurs BBB</h1>
          <p className="text-sm text-gray-400">{servers.length} serveur(s) configuré(s)</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <PlusIcon className="w-4 h-4" />
            Ajouter un serveur
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
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-xl border border-gray-100 p-5 mb-6"
        >
          <h2 className="text-sm font-medium text-gray-700 mb-4">Nouveau serveur BBB</h2>
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
                placeholder="bbb-prod-01"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL API BBB</label>
              <input
                type="url"
                placeholder="https://bbb.exemple.sn"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Secret (bbb-conf --secret)</label>
              <input
                type="password"
                placeholder="secret BBB"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              URL Nginx du dossier raw <span className="text-gray-400">(optionnel — pour analyse events.xml)</span>
            </label>
            <input
              type="url"
              placeholder="https://serveur.example.com/bbbmanager/"
              value={form.rawIndexUrl}
              onChange={(e) => setForm({ ...form, rawIndexUrl: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              URL exposant <code className="font-mono">/var/bigbluebutton/recording/raw/</code> via Nginx.
              Permet à BBB Manager de lire les <code className="font-mono">events.xml</code> et d&apos;identifier
              les enregistrements à rebuilder (status=0).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Utilisateur Basic Auth <span className="text-gray-400">(si l&apos;index est protégé)</span>
              </label>
              <input
                type="text"
                placeholder="bbbmanager"
                value={form.rawIndexUser}
                onChange={(e) => setForm({ ...form, rawIndexUser: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mot de passe Basic Auth</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.rawIndexPassword}
                onChange={(e) => setForm({ ...form, rawIndexPassword: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                autoComplete="new-password"
              />
            </div>
          </div>
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
              {saving ? 'Vérification...' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      {/* Liste serveurs */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Aucun serveur configuré
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nom</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">URL</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Index raw</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Enregistrements</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Dernière sync</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Statut</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => (
                <tr key={server.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">{server.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[180px]">{server.url}</td>
                  <td className="px-4 py-3 text-xs">
                    {editingId === server.id ? (
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="url"
                          value={editRawUrl}
                          onChange={(e) => setEditRawUrl(e.target.value)}
                          placeholder="https://serveur/bbbmanager/"
                          className="w-64 text-xs border border-gray-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-300"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editRawUser}
                            onChange={(e) => setEditRawUser(e.target.value)}
                            placeholder="user (optionnel)"
                            autoComplete="off"
                            className="w-32 text-xs border border-gray-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-300"
                          />
                          <input
                            type="password"
                            value={editRawPassword}
                            onChange={(e) => setEditRawPassword(e.target.value)}
                            placeholder="password"
                            autoComplete="new-password"
                            className="w-32 text-xs border border-gray-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-300"
                          />
                          <button onClick={() => handleSaveRawUrl(server.id)} className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">✓</button>
                          <button onClick={() => { setEditingId(null); setEditRawUrl(''); setEditRawUser(''); setEditRawPassword('') }} className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">✕</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {server.rawIndexUrl ? (
                            <span className="text-gray-600 font-mono truncate max-w-[180px]" title={server.rawIndexUrl}>{server.rawIndexUrl}</span>
                          ) : (
                            <span className="text-orange-500 italic">non configuré</span>
                          )}
                          {isAdmin && (
                            <button onClick={() => startEditRawUrl(server)} className="text-xs text-blue-600 hover:underline">
                              modifier
                            </button>
                          )}
                        </div>
                        {server.rawIndexUrl && (
                          <div className="flex items-center gap-2 text-[10px]">
                            {server.hasRawIndexAuth ? (
                              <span className="text-green-600">🔒 auth configurée</span>
                            ) : (
                              <span className="text-gray-400">accès public (pas d&apos;auth)</span>
                            )}
                            {isAdmin && server.hasRawIndexAuth && (
                              <button onClick={() => handleClearRawAuth(server.id)} className="text-red-500 hover:underline">
                                supprimer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{server.recordings}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(server.lastSyncAt)}</td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <button
                        onClick={() => handleToggle(server.id, server.isActive)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition ${
                          server.isActive
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {server.isActive ? 'Actif' : 'Inactif'}
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          server.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {server.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <button
                        onClick={() => handleDelete(server.id, server.name, server.recordings)}
                        disabled={deleting === server.id}
                        className="text-gray-300 hover:text-red-500 transition disabled:opacity-30 disabled:cursor-wait"
                        title={`Supprimer ${server.name}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
