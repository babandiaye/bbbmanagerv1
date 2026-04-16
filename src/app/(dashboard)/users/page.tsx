'use client'

import { useState, useEffect } from 'react'

type User = {
  id: string
  fullName: string | null
  email: string
  preferredUsername: string
  direction: string
  role: 'admin' | 'auditeur'
  isActive: boolean
  lastLogin: string | null
  createdAt: string
}

function formatDate(date: string | null) {
  if (!date) return 'Jamais'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  async function loadUsers() {
    setLoading(true)
    const res = await fetch('/api/users')
    const data = await res.json()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function handleRoleChange(id: string, role: 'admin' | 'auditeur') {
    setUpdating(id)
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    await loadUsers()
    setUpdating(null)
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setUpdating(id)
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    await loadUsers()
    setUpdating(null)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Utilisateurs</h1>
        <p className="text-sm text-gray-400">{users.length} utilisateur(s) DITSI</p>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Aucun utilisateur — les comptes sont créés automatiquement à la première connexion
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Utilisateur</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Direction</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Rôle</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Statut</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Dernière connexion</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Membre depuis</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{user.fullName ?? user.preferredUsername}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {user.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={updating === user.id}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'auditeur')}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="auditeur">Auditeur</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(user.id, user.isActive)}
                      disabled={updating === user.id}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition disabled:opacity-50 ${
                        user.isActive
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      {user.isActive ? 'Actif' : 'Désactivé'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(user.lastLogin)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
