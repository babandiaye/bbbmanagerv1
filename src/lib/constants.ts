/** Durée minimum (en secondes) pour qu'un enregistrement soit rebuilable */
export const MIN_RECORDING_DURATION_SEC = 600

/**
 * États BBB dans lesquels un enregistrement peut être publié (rebuild).
 * - processed : traité par BBB mais pas encore publié
 * - unpublished : dé-publié par un admin, peut être re-publié
 */
export const REBUILDABLE_STATES = ['processed', 'unpublished'] as const

/** Tous les états BBB valides (documentation officielle BBB 3.0) */
export const BBB_STATES = ['processing', 'processed', 'published', 'unpublished', 'deleted'] as const

/** Nombre d'enregistrements par page */
export const RECORDINGS_PER_PAGE = 50

export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
} as const
