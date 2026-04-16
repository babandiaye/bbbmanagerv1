'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

type Server = {
  id: string
  name: string
  url: string
  isActive: boolean
  lastSyncAt: string | null
  recordings: number
}

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', secret: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      setForm({ name: '', url: '', secret: '' })
      setShowForm(false)
      loadServers()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer le serveur "${name}" ?`)) return
    await fetch(`/api/servers/${id}`, { method: 'DELETE' })
    loadServers()
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    loadServers()
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <PlusIcon className="w-4 h-4" />
          Ajouter un serveur
        </button>
      </div>

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
                  <td className="px-4 py-3 text-gray-600">{server.recordings}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(server.lastSyncAt)}</td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(server.id, server.name)}
                      className="text-gray-300 hover:text-red-500 transition"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
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
