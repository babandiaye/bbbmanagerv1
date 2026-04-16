'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  HomeIcon,
  ServerIcon,
  FilmIcon,
  UsersIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

const navItems = [
  { href: '/',             label: 'Dashboard',        icon: HomeIcon },
  { href: '/servers',      label: 'Serveurs BBB',     icon: ServerIcon },
  { href: '/recordings',   label: 'Enregistrements',  icon: FilmIcon },
  { href: '/rebuild',      label: 'Publication CSV',  icon: ArrowUpTrayIcon },
  { href: '/users',        label: 'Utilisateurs',     icon: UsersIcon },
]

export default function Sidebar({
  userFullName,
  userRole,
}: {
  userFullName: string
  userRole: string
}) {
  const pathname = usePathname()

  return (
    <aside className="w-52 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      {/* Logo UN-CHK */}
      <div className="px-4 py-4 border-b border-gray-100 flex flex-col items-center gap-1">
        <img src="/logo-unchk.png" alt="UN-CHK" className="h-10 object-contain" />
        <span className="text-xs font-semibold text-gray-800">BBB Manager</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3">
        <p className="px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
          Navigation
        </p>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-2.5 px-4 py-2 text-sm transition',
              pathname === href
                ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 truncate">{userFullName}</p>
        <p className="text-[10px] text-gray-400 uppercase mb-3">{userRole}</p>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: '#fff1f1',
            border: '1px solid #fecaca',
            borderRadius: 7,
            color: '#dc2626',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            fontWeight: 500,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64A9 9 0 1 1 5.64 5.64"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
