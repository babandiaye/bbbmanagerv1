import { prisma } from '../src/lib/prisma'

const IDS = [
  '392b7db00658190931cf81990290c111dd1c9238-1773746997298',
  '2191cb5c54d83dff657989597301046db76b4937-1773747164558',
  'dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1765466746341',
  'dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1766049811054',
  '715016be7155e39da91c3f045c41b31f4e0f390b-1773747273744',
  '93ddcfa008559611b061874021f1dd9b4e52faf7-1773832305775',
  '8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773794630245',
]

async function main() {
  const found = await prisma.recording.findMany({
    where: { recordId: { in: IDS } },
    select: {
      recordId: true,
      meetingId: true,
      state: true,
      published: true,
      startTime: true,
      durationSec: true,
      server: { select: { name: true } },
    },
  })
  console.log(`En base BBB Manager : ${found.length} / ${IDS.length}`)
  found.forEach(r => {
    console.log(`  ${r.recordId}`)
    console.log(`     server=${r.server.name}, state=${r.state}, published=${r.published}, start=${r.startTime.toISOString()}`)
  })
  const missing = IDS.filter(id => !found.find(f => f.recordId === id))
  console.log(`\nNON trouvés en base : ${missing.length}`)
  missing.forEach(id => {
    const ts = parseInt(id.split('-')[1], 10)
    console.log(`  ${id}  →  date estimée: ${new Date(ts).toISOString()}`)
  })

  // Pour les non trouvés, voir si le préfixe existe en base (autre recording de la même activité)
  const prefixes = [...new Set(missing.map(id => id.split('-')[0]))]
  console.log(`\nPréfixes uniques manquants : ${prefixes.length}`)
  for (const p of prefixes) {
    const c = await prisma.recording.count({ where: { meetingId: { startsWith: p } } })
    console.log(`  ${p} : ${c} recordings de la même activité en base`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
