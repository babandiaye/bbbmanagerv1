/** Durée minimum (en secondes) pour qu'un enregistrement soit rebuilable */
export const MIN_RECORDING_DURATION_SEC = 900

/** Nombre minimum de participants pour qu'un enregistrement soit rebuildable */
export const MIN_PARTICIPANTS_FOR_REBUILD = 2

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

/** Fenetre de scan cote serveur (autoindex) : on ignore les dossiers raw plus anciens. */
export const RAW_SCAN_WINDOW_DAYS = 70

/** Fenetre par defaut affichee dans le dashboard pour les orphelins rebuildables. */
export const RAW_DEFAULT_VIEW_DAYS = 30

/** Concurrence des fetch events.xml lors du scan. */
export const RAW_SCAN_CONCURRENCY = 20

export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
} as const
