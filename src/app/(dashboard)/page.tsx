import { auth } from '@/lib/auth'
import DashboardClient from '@/components/DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  return <DashboardClient fullName={session?.user?.fullName ?? ''} />
}
