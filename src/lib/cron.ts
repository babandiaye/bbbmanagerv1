import cron from 'node-cron'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { syncAllServers, type SyncResult } from '@/lib/sync'
import { scanRawDiscoveries, type RawScanResult } from '@/lib/raw-scan'

const LOCK_KEY = 'bbbmanager:sync:lock'
const LAST_RESULT_KEY = 'bbbmanager:sync:last-auto-result'
const LOCK_TTL_SEC = 600 // 10 min — au cas où la sync crash, le lock expire tout seul
const SCHEDULE = '0 * * * *' // Toutes les heures pile (minute 0)

const RAW_SCAN_LOCK_KEY = 'bbbmanager:raw-scan:lock'
const RAW_SCAN_LAST_RESULT_KEY = 'bbbmanager:raw-scan:last-result'
const RAW_SCAN_LOCK_TTL_SEC = 60 * 30 // 30 min — un scan complet dure rarement plus
const RAW_SCAN_SCHEDULE = '15 */4 * * *' // Toutes les 4h, a la minute 15 (decale du sync horaire)

let cronStarted = false

/**
 * Type du résultat persisté en Redis après chaque sync auto.
 * Permet à l'UI d'afficher une notification en cas d'échec.
 */
export type LastAutoSyncResult = {
  startedAt: string // ISO
  finishedAt: string // ISO
  durationMs: number
  synced: number
  errors: string[]
  serversProcessed: number
}

/**
 * Démarre le cron auto-sync toutes les heures (0 * * * *).
 *  - Contrôlé par SYNC_AUTO_ENABLED
 *  - Lock Redis pour empêcher les exécutions concurrentes (multi-instances ou
 *    sync manuelle en cours)
 *  - Stocke le dernier résultat en Redis pour affichage dans l'UI
 */
export function startAutoSyncCron(): void {
  if (cronStarted) return
  cronStarted = true

  if (process.env.SYNC_AUTO_ENABLED !== 'true') {
    logger.info('Cron auto-sync désactivé (SYNC_AUTO_ENABLED != true)')
    return
  }

  if (!redis) {
    logger.warn('Redis indisponible — cron auto-sync démarré sans lock distribué')
  }

  cron.schedule(SCHEDULE, runAutoSync, { timezone: 'Africa/Dakar' })
  logger.info({ schedule: SCHEDULE }, 'Cron auto-sync activé')

  cron.schedule(RAW_SCAN_SCHEDULE, runRawScan, { timezone: 'Africa/Dakar' })
  logger.info({ schedule: RAW_SCAN_SCHEDULE }, 'Cron raw-scan activé')
}

async function runAutoSync(): Promise<void> {
  // Lock distribué via Redis si disponible
  if (redis) {
    try {
      const acquired = await redis.set(LOCK_KEY, String(process.pid), 'EX', LOCK_TTL_SEC, 'NX')
      if (acquired !== 'OK') {
        logger.info('Cron : sync déjà en cours (lock Redis pris), skip')
        return
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Cron : erreur acquisition lock Redis')
      return
    }
  }

  let result: SyncResult | null = null
  try {
    result = await syncAllServers('cron')
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cron : sync auto a crashé')
    // Persister un résultat d'erreur global pour que l'UI l'affiche
    await persistLastResult({
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      synced: 0,
      errors: [`Crash: ${err.message}`],
      serversProcessed: 0,
    })
  }

  // Libérer le lock
  if (redis) {
    try {
      await redis.del(LOCK_KEY)
    } catch {
      // TTL le libérera tout seul
    }
  }

  // Persister le résultat pour l'UI
  if (result) {
    await persistLastResult({
      startedAt: result.startedAt.toISOString(),
      finishedAt: result.finishedAt.toISOString(),
      durationMs: result.durationMs,
      synced: result.synced,
      errors: result.errors,
      serversProcessed: result.serversProcessed,
    })
  }
}

async function persistLastResult(result: LastAutoSyncResult): Promise<void> {
  if (!redis) return
  try {
    // On garde 7 jours d'historique du dernier résultat
    await redis.set(LAST_RESULT_KEY, JSON.stringify(result), 'EX', 60 * 60 * 24 * 7)
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cron : erreur persistance résultat')
  }
}

/** Lit le dernier résultat de sync auto depuis Redis */
export async function getLastAutoSyncResult(): Promise<LastAutoSyncResult | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(LAST_RESULT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export type LastRawScanResult = RawScanResult & { startedAt: string; finishedAt: string }

async function runRawScan(): Promise<void> {
  if (redis) {
    try {
      const acquired = await redis.set(RAW_SCAN_LOCK_KEY, String(process.pid), 'EX', RAW_SCAN_LOCK_TTL_SEC, 'NX')
      if (acquired !== 'OK') {
        logger.info('Cron : raw-scan déjà en cours (lock Redis pris), skip')
        return
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Cron : erreur acquisition lock raw-scan')
      return
    }
  }

  const startedAt = new Date()
  let result: RawScanResult | null = null
  try {
    result = await scanRawDiscoveries()
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cron : raw-scan a crashé')
  }

  if (redis) {
    try { await redis.del(RAW_SCAN_LOCK_KEY) } catch {}
  }

  if (result && redis) {
    try {
      await redis.set(
        RAW_SCAN_LAST_RESULT_KEY,
        JSON.stringify({ ...result, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString() }),
        'EX', 60 * 60 * 24 * 7,
      )
    } catch (err: any) {
      logger.error({ err: err.message }, 'Cron : erreur persistance raw-scan')
    }
  }
}

/** Lit le dernier resultat du scan raw depuis Redis */
export async function getLastRawScanResult(): Promise<LastRawScanResult | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(RAW_SCAN_LAST_RESULT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Declenche un scan manuel (utilise par l'API /api/raw-scan).
 * Verifie le lock Redis pour eviter les concurrences avec le cron.
 */
export async function triggerRawScan(): Promise<{ ok: boolean; reason?: string; result?: RawScanResult }> {
  if (redis) {
    try {
      const acquired = await redis.set(RAW_SCAN_LOCK_KEY, String(process.pid), 'EX', RAW_SCAN_LOCK_TTL_SEC, 'NX')
      if (acquired !== 'OK') return { ok: false, reason: 'Scan déjà en cours' }
    } catch (err: any) {
      return { ok: false, reason: `Lock Redis: ${err.message}` }
    }
  }
  const startedAt = new Date()
  try {
    const result = await scanRawDiscoveries()
    if (redis) {
      try {
        await redis.set(
          RAW_SCAN_LAST_RESULT_KEY,
          JSON.stringify({ ...result, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString() }),
          'EX', 60 * 60 * 24 * 7,
        )
      } catch {}
    }
    return { ok: true, result }
  } finally {
    if (redis) {
      try { await redis.del(RAW_SCAN_LOCK_KEY) } catch {}
    }
  }
}
