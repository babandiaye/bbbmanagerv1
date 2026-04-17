import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Routes publiques
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/public-stats')
  ) {
    return NextResponse.next()
  }

  // Redirige vers login si non connecté
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Vérifie que le compte est actif
  if (!req.auth?.user?.isActive) {
    return NextResponse.redirect(new URL('/login?error=disabled', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Exclut les assets statiques (fichiers Next.js + tout fichier avec extension image/media courante)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
