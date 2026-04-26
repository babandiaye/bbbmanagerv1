import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { fetchAndAnalyzeEvents, buildEventsUrl } from '../src/lib/bbb-raw'
import { findRecordingById } from '../src/lib/bbb'

const TARGET = 'be60ba54bde570d617991f47eaef890bf49527dc-1774349997616'

async function main() {
  console.log(`\n--- 1. En base ? ---`)
  const dbRec = await prisma.recording.findUnique({
    where: { recordId: TARGET },
    include: { server: true },
  })
  console.log(dbRec ? `✓ ${dbRec.server.name}, state=${dbRec.state}, published=${dbRec.published}` : '✗ pas en base')

  console.log(`\n--- 2. API BBB ---`)
  const servers = await prisma.bbbServer.findMany({ where: { isActive: true } })
  for (const s of servers) {
    try {
      const secret = decrypt(s.secretEnc)
      const found = await findRecordingById(s.url, secret, TARGET)
      console.log(`  ${s.name.padEnd(14)}: ${found ? `✓ state=${found.state}` : '—'}`)
    } catch (e: any) {
      console.log(`  ${s.name.padEnd(14)}: ERR ${e.message}`)
    }
  }

  console.log(`\n--- 3. events.xml via autoindex ---`)
  const rawServers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { name: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })
  for (const s of rawServers) {
    if (!s.rawIndexUrl) continue
    let auth: string | null = null
    if (s.rawIndexAuthEnc) {
      try { auth = decrypt(s.rawIndexAuthEnc) } catch {}
    }
    const url = buildEventsUrl(s.rawIndexUrl, TARGET)
    const a = await fetchAndAnalyzeEvents(s.rawIndexUrl, TARGET, auth)
    console.log(`  ${s.name.padEnd(14)}: ${a ? `✓ start=${a.startTimeMs ? new Date(a.startTimeMs).toISOString() : 'null'} dur=${a.durationSec}s parts=${a.participantCount} rebuildable=${a.isRebuildable}` : '✗ 404 ou erreur'}`)
    console.log(`     URL: ${url}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
