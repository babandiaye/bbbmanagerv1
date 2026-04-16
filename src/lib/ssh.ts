import { Client } from 'ssh2'

/**
 * Exécute `bbb-record --rebuild <recordId>` via SSH sur un serveur BBB.
 * Retourne la sortie stdout ou lève une erreur.
 */
export function sshRebuild(options: {
  host: string
  port: number
  username: string
  privateKey: string
  recordId: string
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const cmd = `sudo bbb-record --rebuild ${options.recordId}`

    conn
      .on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) {
            conn.end()
            return reject(err)
          }

          let stdout = ''
          let stderr = ''

          stream
            .on('close', (code: number) => {
              conn.end()
              if (code === 0) {
                resolve(stdout.trim())
              } else {
                reject(new Error(`Exit code ${code}: ${stderr.trim() || stdout.trim()}`))
              }
            })
            .on('data', (data: Buffer) => { stdout += data.toString() })
            .stderr.on('data', (data: Buffer) => { stderr += data.toString() })
        })
      })
      .on('error', (err) => reject(err))
      .connect({
        host: options.host,
        port: options.port,
        username: options.username,
        privateKey: options.privateKey,
        readyTimeout: 10000,
      })
  })
}
