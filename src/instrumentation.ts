/**
 * Hook Next.js exécuté une seule fois au démarrage du processus serveur.
 * Utilisé pour initialiser le cron auto-sync.
 *
 * Doc : https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Ne s'exécute que côté Node.js runtime (pas Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutoSyncCron } = await import('@/lib/cron')
    startAutoSyncCron()
  }
}
