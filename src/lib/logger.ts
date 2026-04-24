import pino from 'pino'

/**
 * Logger structuré JSON pour la production.
 * En dev, formate avec pino-pretty pour la lisibilité.
 *
 * Usage :
 *   logger.info({ userId, action: 'sync_start' }, 'Synchronisation lancée')
 *   logger.error({ err, serverId }, 'Échec sync serveur BBB')
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
  base: { app: 'bbbmanager' },
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.secret', '*.secretEnc', '*.sshKeyEnc'],
})
