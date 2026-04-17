'use client'

import { useState, useEffect } from 'react'

export type CurrentUser = {
  id: string
  fullName: string
  role: 'admin' | 'auditeur'
  email: string
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  return { user, loading, isAdmin: user?.role === 'admin' }
}
