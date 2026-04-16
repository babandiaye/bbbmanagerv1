import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { MIN_RECORDING_DURATION_SEC, REBUILDABLE_STATES } from '@/lib/constants'
import RebuildButton from '@/components/RebuildButton'
import SyncButton from '@/components/SyncButton'

async function getStats() {
  const [
    totalRecordings,
    publishedRecordings,
    unpublishedRecordings,
    rebuildableRecordings,
    pendingJobs,
    runningJobs,
    totalServers,
    activeServers,
  ] = await Promise.all([
    prisma.recording.count(),
    prisma.recording.count({ where: { published: true } }),
    prisma.recording.count({ where: { published: false } }),
    prisma.recording.count({
      where: { published: false, state: { in: [...REBUILDABLE_STATES] }, durationSec: { gte: MIN_RECORDING_DURATION_SEC } },
    }),
    prisma.rebuildJob.count({ where: { status: 'pending' } }),
    prisma.rebuildJob.count({ where: { status: 'running' } }),
    prisma.bbbServer.count(),
    prisma.bbbServer.count({ where: { isActive: true } }),
  ])

  const publishRate = totalRecordings > 0
    ? Math.round((publishedRecordings / totalRecordings) * 100)
    : 0

  return {
    totalRecordings,
    publishedRecordings,
    unpublishedRecordings,
    rebuildableRecordings,
    pendingJobs,
    runningJobs,
    totalServers,
    activeServers,
    publishRate,
  }
}

async function getRecentUnpublished() {
  return prisma.recording.findMany({
    where: { published: false },
    include: { server: { select: { name: true } } },
    orderBy: { startTime: 'desc' },
    take: 10,
  })
}

function StatCard({
  label,
  value,
  sub,
  subColor = 'text-gray-400',
}: {
  label: string
  value: string | number
  sub?: string
  subColor?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-medium text-gray-900">{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>}
    </div>
  )
}

function StatusBadge({ published, state, durationSec }: {
  published: boolean
  state: string
  durationSec: number
}) {
  if (published) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
        Publié
      </span>
    )
  }
  if (state === 'processing') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
        En traitement
      </span>
    )
  }
  if (state === 'processed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
        Traité — non publié
      </span>
    )
  }
  if (state === 'unpublished') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
        Dé-publié
      </span>
    )
  }
  if (durationSec < MIN_RECORDING_DURATION_SEC) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        Trop court
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      {state}
    </span>
  )
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(date))
}

export default async function DashboardPage() {
  const session = await auth()
  const [stats, recentUnpublished] = await Promise.all([
    getStats(),
    getRecentUnpublished(),
  ])

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400">
            Bienvenue, {session?.user?.fullName}
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total enregistrements"
          value={stats.totalRecordings}
          sub={`${stats.activeServers}/${stats.totalServers} serveurs actifs`}
        />
        <StatCard
          label="Non publiés"
          value={stats.unpublishedRecordings}
          sub={`dont ${stats.rebuildableRecordings} rebuilables`}
          subColor="text-red-500"
        />
        <StatCard
          label="Jobs en attente"
          value={stats.pendingJobs}
          sub={`${stats.runningJobs} en cours`}
          subColor={stats.runningJobs > 0 ? 'text-amber-500' : 'text-gray-400'}
        />
        <StatCard
          label="Taux publication"
          value={`${stats.publishRate}%`}
          sub={`${stats.publishedRecordings} publiés`}
          subColor="text-green-500"
        />
      </div>

      {/* Tableau enregistrements non publiés */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">
            Enregistrements non publiés
          </h2>
          <a
            href="/recordings"
            className="text-xs text-blue-600 hover:underline"
          >
            Voir tout
          </a>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nom</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Serveur</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Durée</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Statut</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Date</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentUnpublished.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-8 text-sm">
                    Aucun enregistrement non publié
                  </td>
                </tr>
              ) : (
                recentUnpublished.map((rec) => {
                  const isRebuildable =
                    !rec.published &&
                    (REBUILDABLE_STATES as readonly string[]).includes(rec.state) &&
                    rec.durationSec >= MIN_RECORDING_DURATION_SEC

                  return (
                    <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 max-w-[180px] truncate font-medium text-gray-800">
                        {rec.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {rec.server.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDuration(rec.durationSec)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          published={rec.published}
                          state={rec.state}
                          durationSec={rec.durationSec}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {formatDate(rec.startTime)}
                      </td>
                      <td className="px-4 py-3">
                        {isRebuildable ? (
                          <RebuildButton recordingId={rec.id} />
                        ) : (
                          <span className="text-xs text-gray-300">
                            Non disponible
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
