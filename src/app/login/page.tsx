import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LoginClient from '@/components/LoginClient'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/')

  const { error } = await searchParams
  return <LoginClient error={error} />
}
