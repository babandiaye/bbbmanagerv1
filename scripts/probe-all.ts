import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { listRawDirectories } from '../src/lib/bbb-raw'

const ALL_IDS = `392b7db00658190931cf81990290c111dd1c9238-1773746997298
2191cb5c54d83dff657989597301046db76b4937-1773747164558
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1765466746341
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1766049811054
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1766500193752
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1766665049656
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1766748974351
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1769533678340
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1770304181244
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1772061787272
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1772118904229
dfb6a86b54bd7daff62ec5528fe4b1533a49aa67-1772455974413
715016be7155e39da91c3f045c41b31f4e0f390b-1773747273744
2191cb5c54d83dff657989597301046db76b4937-1773747346759
392b7db00658190931cf81990290c111dd1c9238-1772798114065
392b7db00658190931cf81990290c111dd1c9238-1772844220367
be60ba54bde570d617991f47eaef890bf49527dc-1773136941292
2191cb5c54d83dff657989597301046db76b4937-1773143022600
2191cb5c54d83dff657989597301046db76b4937-1773143243386
392b7db00658190931cf81990290c111dd1c9238-1773144331966
392b7db00658190931cf81990290c111dd1c9238-1773748201757
715016be7155e39da91c3f045c41b31f4e0f390b-1773146492002
be60ba54bde570d617991f47eaef890bf49527dc-1773226967569
93ddcfa008559611b061874021f1dd9b4e52faf7-1773356127095
392b7db00658190931cf81990290c111dd1c9238-1773748636691
8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773739276806
be60ba54bde570d617991f47eaef890bf49527dc-1773740387475
be60ba54bde570d617991f47eaef890bf49527dc-1773742784036
715016be7155e39da91c3f045c41b31f4e0f390b-1773745961327
715016be7155e39da91c3f045c41b31f4e0f390b-1773746518163
8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773745154849
93ddcfa008559611b061874021f1dd9b4e52faf7-1773744522076
715016be7155e39da91c3f045c41b31f4e0f390b-1773746911782
8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773748963718
2191cb5c54d83dff657989597301046db76b4937-1773749106927
392b7db00658190931cf81990290c111dd1c9238-1773750095237
392b7db00658190931cf81990290c111dd1c9238-1773750264161
715016be7155e39da91c3f045c41b31f4e0f390b-1773750496980
8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773752373392
715016be7155e39da91c3f045c41b31f4e0f390b-1773753119150
2191cb5c54d83dff657989597301046db76b4937-1773753310733
93ddcfa008559611b061874021f1dd9b4e52faf7-1773753687672
93ddcfa008559611b061874021f1dd9b4e52faf7-1773754988774
8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773755070428
93ddcfa008559611b061874021f1dd9b4e52faf7-1773755794760
2191cb5c54d83dff657989597301046db76b4937-1773760662470
be60ba54bde570d617991f47eaef890bf49527dc-1773761627424
93ddcfa008559611b061874021f1dd9b4e52faf7-1773771816092
8d2993e432c05f7c7c3a390bdce67439eeb31a3f-1773794630245
93ddcfa008559611b061874021f1dd9b4e52faf7-1773832305775`.split('\n').map(s => s.trim()).filter(Boolean)

async function main() {
  // Étape 1: DB
  const inDb = await prisma.recording.findMany({
    where: { recordId: { in: ALL_IDS } },
    select: { recordId: true, server: { select: { name: true } } },
  })
  const dbSet = new Set(inDb.map(r => r.recordId))

  // Étape 2: pour chaque préfixe, lister une seule fois sur chaque serveur
  const prefixes = [...new Set(ALL_IDS.map(id => id.split('-')[0]))]
  const servers = await prisma.bbbServer.findMany({
    where: { isActive: true, rawIndexUrl: { not: null } },
    select: { id: true, name: true, rawIndexUrl: true, rawIndexAuthEnc: true },
  })

  // Map<recordId, serverName>
  const inRaw = new Map<string, string>()
  for (const prefix of prefixes) {
    for (const s of servers) {
      if (!s.rawIndexUrl) continue
      let auth: string | null = null
      if (s.rawIndexAuthEnc) {
        try { auth = decrypt(s.rawIndexAuthEnc) } catch { auth = null }
      }
      const dirs = await listRawDirectories(s.rawIndexUrl, auth, prefix)
      for (const d of dirs) {
        if (ALL_IDS.includes(d.recordId) && !inRaw.has(d.recordId)) {
          inRaw.set(d.recordId, s.name)
        }
      }
    }
  }

  console.log(`\nTotal IDs : ${ALL_IDS.length}`)
  console.log(`En base BBB Manager : ${dbSet.size}`)
  console.log(`Présent en raw (autoindex) : ${inRaw.size}`)
  console.log(`Présent en raw OU en base : ${new Set([...dbSet, ...inRaw.keys()]).size}`)
  console.log(`Vraiment introuvables : ${ALL_IDS.length - new Set([...dbSet, ...inRaw.keys()]).size}\n`)

  console.log('--- Détail IDs trouvés en RAW ---')
  for (const [id, name] of inRaw) console.log(`  ${id}  →  ${name}`)
  console.log('\n--- Détail IDs trouvés en DB ---')
  inDb.forEach(r => console.log(`  ${r.recordId}  →  ${r.server.name}`))

  console.log('\n--- IDs vraiment introuvables (raw cleanup probable) ---')
  const allFound = new Set([...dbSet, ...inRaw.keys()])
  for (const id of ALL_IDS) {
    if (!allFound.has(id)) {
      const ts = parseInt(id.split('-')[1], 10)
      console.log(`  ${id}  (${new Date(ts).toISOString().slice(0, 10)})`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
