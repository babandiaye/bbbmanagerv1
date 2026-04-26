import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import axios from 'axios'

async function main() {
  const servers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { name: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })

  for (const s of servers) {
    if (!s.rawIndexUrl) continue
    let auth: string | null = null
    if (s.rawIndexAuthEnc) {
      try { auth = decrypt(s.rawIndexAuthEnc) } catch { auth = null }
    }
    const headers: Record<string, string> = {}
    if (auth) headers.Authorization = 'Basic ' + Buffer.from(auth).toString('base64')
    try {
      const res = await axios.get(s.rawIndexUrl, { timeout: 10000, headers, validateStatus: () => true, responseType: 'text' })
      let entries = 0
      let firstFew: string[] = []
      if (res.status === 200) {
        try {
          const data = JSON.parse(res.data)
          if (Array.isArray(data)) {
            entries = data.length
            firstFew = data.slice(0, 5).map((d: any) => `${d.type === 'directory' ? 'd' : 'f'} ${d.name}`)
          }
        } catch {
          firstFew = ['(non-JSON response)']
        }
      }
      console.log(`\n${s.name}: ${s.rawIndexUrl}`)
      console.log(`  HTTP ${res.status}, ${entries} entries`)
      firstFew.forEach(e => console.log(`    ${e}`))
    } catch (e: any) {
      console.log(`\n${s.name}: ${s.rawIndexUrl}`)
      console.log(`  ERR ${e.code ?? e.message}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
