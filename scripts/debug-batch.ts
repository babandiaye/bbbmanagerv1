import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { fetchAndAnalyzeEvents, buildEventsUrl } from '../src/lib/bbb-raw'
import axios from 'axios'

const TEST_IDS = [
  '392b7db00658190931cf81990290c111dd1c9238-1773746997298',
  'dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1765466746341',
  '715016be7155e39da91c3f045c41b31f4e0f390b-1773747273744',
  '93ddcfa008559611b061874021f1dd9b4e52faf7-1773832305775',
]

async function main() {
  const servers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { id: true, name: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })

  for (const id of TEST_IDS) {
    console.log(`\n=== ${id} ===`)
    for (const s of servers) {
      if (!s.rawIndexUrl) continue
      let auth: string | null = null
      if (s.rawIndexAuthEnc) {
        try { auth = decrypt(s.rawIndexAuthEnc) } catch { auth = null }
      }
      const url = buildEventsUrl(s.rawIndexUrl, id)
      const headers: Record<string, string> = {}
      if (auth) headers.Authorization = 'Basic ' + Buffer.from(auth).toString('base64')
      try {
        const res = await axios.get(url, { timeout: 8000, headers, validateStatus: () => true, responseType: 'text' })
        console.log(`  ${s.name.padEnd(14)} → HTTP ${res.status} (${typeof res.data === 'string' ? res.data.length : 0} bytes)`)
        if (res.status === 200 && typeof res.data === 'string' && res.data.length > 0) {
          const a = await fetchAndAnalyzeEvents(s.rawIndexUrl, id, auth)
          console.log(`     analysis: startMs=${a?.startTimeMs}, dur=${a?.durationSec}s, parts=${a?.participantCount}, rebuildable=${a?.isRebuildable}`)
        }
      } catch (e: any) {
        console.log(`  ${s.name.padEnd(14)} → ERR ${e.code ?? e.message}`)
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
