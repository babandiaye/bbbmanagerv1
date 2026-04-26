import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { findRecordingById } from '../src/lib/bbb'

const TARGET = 'be60ba54bde570d617991f47eaef890bf49527dc-1773742784036'

async function main() {
  console.log(`\n--- 1. Recherche en base BBB Manager ---`)
  const dbRec = await prisma.recording.findUnique({
    where: { recordId: TARGET },
    include: { server: true },
  })
  if (dbRec) {
    console.log(`✓ TROUVÉ en base`)
    console.log(`  Serveur     : ${dbRec.server.name} (${dbRec.server.url})`)
    console.log(`  state       : ${dbRec.state}`)
    console.log(`  published   : ${dbRec.published}`)
    console.log(`  startTime   : ${dbRec.startTime.toISOString()}`)
    console.log(`  duration    : ${Math.round(dbRec.durationSec / 60)} min`)
    console.log(`  meetingId   : ${dbRec.meetingId}`)
    const meta = (dbRec.rawData as any)?.metadata ?? {}
    console.log(`  bbb-context : ${meta['bbb-context-name'] ?? '—'}  /  ${meta['bbb-context-label'] ?? '—'}`)
    console.log(`  origine     : ${meta['bbb-origin-server-name'] ?? '—'}`)
  } else {
    console.log(`✗ Pas en base`)
  }

  console.log(`\n--- 2. Appel API BBB sur chaque serveur actif ---`)
  const servers = await prisma.bbbServer.findMany({ where: { isActive: true } })
  for (const s of servers) {
    try {
      const secret = decrypt(s.secretEnc)
      const found = await findRecordingById(s.url, secret, TARGET)
      if (found) {
        console.log(`✓ ${s.name}: TROUVÉ via API (state=${found.state}, published=${found.published})`)
      } else {
        console.log(`  ${s.name}: non trouvé via API`)
      }
    } catch (e: any) {
      console.log(`  ${s.name}: ERREUR ${e.message}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
