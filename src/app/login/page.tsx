import { auth, signIn } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Footer from '@/components/Footer'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const session = await auth()
  if (session?.user) redirect('/')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow p-8 w-full max-w-sm flex flex-col items-center gap-6">
          <img src="/logo-unchk.png" alt="UNCHK" className="h-16 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-800">BBB Manager</h1>
            <p className="text-sm text-gray-500 mt-1">Accès réservé à la direction DITSI</p>
          </div>

          {searchParams.error === 'disabled' && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              Votre compte est désactivé. Contactez un administrateur.
            </div>
          )}

          {searchParams.error && searchParams.error !== 'disabled' && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              Accès refusé — vous devez appartenir à la direction DITSI.
            </div>
          )}

          <form
            action={async () => {
              'use server'
              await signIn('keycloak', { redirectTo: '/' })
            }}
            className="w-full"
          >
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition"
            >
              Se connecter avec Keycloak UNCHK
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
