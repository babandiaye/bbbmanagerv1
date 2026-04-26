import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { listRawDirectories } from '../src/lib/bbb-raw'

const PREFIXES = [
  '392b7db00658190931cf81990290c111dd1c9238',
  'dfb6a86b54bd7daff62ec5528fe4b1533a49aa67',
  '715016be7155e39da91c3f045c41b31f4e0f390b',
  '93ddcfa008559611b061874021f1dd9b4e52faf7',
  '2191cb5c54d83dff657989597301046db76b4937',
  'be60ba54bde570d617991f47eaef890bf49527dc',
  '8d2993e432c05f7c7c3a390bdce67439eeb31a3f',
]

async function main() {
  const servers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { name: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })

  for (const prefix of PREFIXES) {
    console.log(`\n=== Prefix ${prefix} ===`)
    for (const s of servers) {
      if (!s.rawIndexUrl) continue
      let auth: string | null = null
      if (s.rawIndexAuthEnc) {
        try { auth = decrypt(s.rawIndexAuthEnc) } catch { auth = null }
      }
      const dirs = await listRawDirectories(s.rawIndexUrl, auth, prefix)
      if (dirs.length > 0) {
        console.log(`  ${s.name.padEnd(14)} → ${dirs.length} matches`)
        dirs.slice(0, 3).forEach(d => console.log(`     ${d.recordId} (mtime ${new Date(d.mtimeMs).toISOString()})`))
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
