import { prisma } from '../src/lib/prisma'

async function main() {
  const rows = await prisma.bbbServer.findMany({
    select: { name: true, url: true, isActive: true, rawIndexUrl: true, rawIndexAuthEnc: true },
    orderBy: { name: 'asc' },
  })
  console.table(rows.map(r => ({
    name: r.name,
    active: r.isActive,
    rawIndexUrl: r.rawIndexUrl ?? '— non configuré',
    auth: !!r.rawIndexAuthEnc,
  })))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
