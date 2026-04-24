import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Footer from '@/components/Footer'
import SyncStatusBanner from '@/components/SyncStatusBanner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userFullName={session.user.fullName}
        userRole={session.user.role}
      />
      <div className="flex-1 flex flex-col">
        <SyncStatusBanner />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
