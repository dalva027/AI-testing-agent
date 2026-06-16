import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  FolderGit2,
  ListChecks,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Loader2,
  Github,
  Plus,
  ArrowRight,
  Activity,
  BarChart3,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useUser } from '../App'

interface TestCase {
  id: number
  title: string
  description: string
  test_type: string
  priority: string
  status: string
  duration_ms: number | null
  created_at: string
  repo_name: string
}

interface Repo {
  id: number
  full_name: string
}

const TYPE_COLORS: Record<string, string> = {
  ui: 'bg-blue-100 text-blue-800',
  auth: 'bg-purple-100 text-purple-800',
  api: 'bg-green-100 text-green-800',
  form: 'bg-amber-100 text-amber-800',
  integration: 'bg-indigo-100 text-indigo-800',
  'edge-case': 'bg-rose-100 text-rose-800',
}

export default function Dashboard() {
  const { user, token } = useUser()
  const [repos, setRepos] = useState<Repo[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [repoRes, tcRes] = await Promise.all([
        axios.get('/api/repos'),
        axios.get('/api/test-cases/all'),
      ])
      setRepos(repoRes.data)
      setTestCases(tcRes.data)
    } catch {
      toast.error('Failed to load dashboard data')
      setRepos([])
      setTestCases([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Not authenticated ----
  if (!token) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto mt-10">
        <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Github className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect GitHub to get started</h2>
        <p className="text-gray-500 mb-6">
          Your dashboard tracks tests across your repositories. Connect a GitHub account to begin.
        </p>
        <a href="/api/auth/github/login" className="btn-primary inline-flex items-center gap-2">
          <Github className="w-4 h-4" />
          Connect GitHub
        </a>
      </div>
    )
  }

  // ---- Derived stats (computed from live data only) ----
  const total = testCases.length
  const passed = testCases.filter(tc => tc.status === 'passed').length
  const failed = testCases.filter(tc => tc.status === 'failed').length
  const pending = total - passed - failed
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  const typeCounts = testCases.reduce<Record<string, number>>((acc, tc) => {
    acc[tc.test_type] = (acc[tc.test_type] || 0) + 1
    return acc
  }, {})
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
  const maxType = typeEntries.length ? typeEntries[0][1] : 0

  const recent = [...testCases]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6)

  const statCards = [
    { label: 'Repositories', value: repos.length, icon: FolderGit2, color: 'text-gray-900', bg: 'bg-gray-50' },
    { label: 'Total Tests', value: total, icon: ListChecks, color: 'text-gray-900', bg: 'bg-gray-50' },
    { label: 'Passed', value: passed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Failed', value: failed, icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Pass Rate', value: `${passRate}%`, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {user?.name ? `Welcome back, ${user.name}` : 'Dashboard'}
          </h1>
          <p className="text-gray-500 mt-1">A live overview of your repositories and test runs</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/workspace" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Repository
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : repos.length === 0 && total === 0 ? (
        /* ---- Empty state (no seeded data) ---- */
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <FolderGit2 className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Nothing to show yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add a repository and generate your first set of AI test cases — your stats and recent
            activity will appear here.
          </p>
          <Link to="/workspace" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Your First Repository
          </Link>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {statCards.map((stat, i) => (
              <div key={i} className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                  </div>
                  <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent activity */}
            <div className="card lg:col-span-2 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900">Recent Test Cases</h3>
                <Link to="/results" className="ml-auto text-sm text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  No test cases yet. Generate some from a repository in your workspace.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recent.map(tc => (
                    <div key={tc.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="shrink-0">
                        {tc.status === 'passed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : tc.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-rose-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{tc.title}</p>
                        <p className="text-xs text-gray-500 truncate">{tc.repo_name}</p>
                      </div>
                      <span className={`badge ${TYPE_COLORS[tc.test_type] || 'badge-neutral'} shrink-0`}>
                        {tc.test_type}
                      </span>
                      <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                        {tc.duration_ms ? `${Math.round(tc.duration_ms)}ms` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Breakdown */}
            <div className="space-y-6">
              {/* Status summary */}
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Status</h3>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'Passed', value: passed, color: 'bg-emerald-500' },
                    { label: 'Failed', value: failed, color: 'bg-rose-500' },
                    { label: 'Pending', value: pending, color: 'bg-amber-400' },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-600">{s.label}</span>
                        <span className="font-medium text-gray-900">{s.value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${s.color} rounded-full transition-all`}
                          style={{ width: `${total > 0 ? (s.value / total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Type breakdown */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900">By Type</h3>
                </div>
                {typeEntries.length === 0 ? (
                  <p className="text-sm text-gray-400">No test cases yet.</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {typeEntries.map(([type, count]) => (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-600">{type}</span>
                          <span className="font-medium text-gray-900">{count}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-full transition-all"
                            style={{ width: `${maxType > 0 ? (count / maxType) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
