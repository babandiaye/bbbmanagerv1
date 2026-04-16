'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSync() {
    setLoading(true)
    try {
      await fetch('/api/recordings/sync', { method: 'POST' })
      router.refresh()
    } catch {
      // silently fail — page will show stale data
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
    >
      {loading ? 'Synchronisation...' : 'Synchroniser'}
    </button>
  )
}
