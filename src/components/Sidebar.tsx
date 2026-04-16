'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  HomeIcon,
  ServerIcon,
  FilmIcon,
  UsersIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

const navItems = [
  { href: '/',             label: 'Dashboard',        icon: HomeIcon },
  { href: '/servers',      label: 'Serveurs BBB',     icon: ServerIcon },
  { href: '/recordings',   label: 'Enregistrements',  icon: FilmIcon },
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
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">B</span>
        </div>
        <span className="text-sm font-semibold text-gray-800">BBB Manager</span>
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
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 transition"
        >
          <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
