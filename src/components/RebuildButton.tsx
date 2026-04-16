'use client'

import { useState } from 'react'

export default function RebuildButton({ recordingId }: { recordingId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)

  async function handleRebuild() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId }),
      })
      setResult(res.ok ? 'success' : 'error')
    } catch {
      setResult('error')
    } finally {
      setLoading(false)
    }
  }

  if (result === 'success') {
    return <span className="text-xs text-green-600 font-medium">Publié ✓</span>
  }

  return (
    <button
      onClick={handleRebuild}
      disabled={loading}
      className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 transition disabled:opacity-50"
    >
      {loading ? 'En cours...' : result === 'error' ? 'Réessayer' : 'Rebuilder'}
    </button>
  )
}
