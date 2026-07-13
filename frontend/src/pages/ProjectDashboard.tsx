import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import {
  ListChecks,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Activity,
  BarChart3,
  Bot,
  Globe,
  Settings2,
  FolderGit2,
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
  name: string
  full_name: string
  default_branch: string
  language: string | null
  target_domain: string | null
}

const TYPE_COLORS: Record<string, string> = {
  ui: 'bg-blue-100 text-blue-800',
  auth: 'bg-purple-100 text-purple-800',
  api: 'bg-green-100 text-green-800',
  form: 'bg-amber-100 text-amber-800',
  integration: 'bg-indigo-100 text-indigo-800',
  'edge-case': 'bg-rose-100 text-rose-800',
}

export default function ProjectDashboard() {
  const { repoId } = useParams<{ repoId: string }>()
  const { token } = useUser()
  const [repo, setRepo] = useState<Repo | null>(null)
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchData = useCallback(async () => {
    if (!token || !repoId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [repoRes, tcRes] = await Promise.all([
        axios.get(`/api/repos/${repoId}`),
        axios.get(`/api/test-cases/repo/${repoId}`),
      ])
      setRepo(repoRes.data)
      setTestCases(tcRes.data)
      setNotFound(false)
    } catch (e: any) {
      if (e.response?.status === 404) setNotFound(true)
      else toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [token, repoId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (notFound || !repo) {
    return (
      <div className="card p-12 text-center max-w-lg mx-auto mt-10">
        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <FolderGit2 className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Project not found</h3>
        <p className="text-gray-500 mb-6">It may have been removed from your workspace.</p>
        <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>
      </div>
    )
  }

  // ---- Derived stats (scoped to this project) ----
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
    { label: 'Total Tests', value: total, icon: ListChecks, color: 'text-gray-900', bg: 'bg-gray-50' },
    { label: 'Passed', value: passed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Failed', value: failed, icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Pending', value: pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pass Rate', value: `${passRate}%`, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
  ]

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Projects
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
            <FolderGit2 className="w-6 h-6 text-gray-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-gray-900 truncate">{repo.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 mt-1">
              <span className="truncate">{repo.full_name}</span>
              <span>·</span>
              <span>{repo.default_branch}</span>
              {repo.target_domain && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                  <Globe className="w-3 h-3" />
                  {repo.target_domain}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={fetchData} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to={`/dashboard/${repo.id}/agent`}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Bot className="w-4 h-4" />
            AI Agent
          </Link>
          <Link
            to={`/workspace?repo=${repo.id}`}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Manage Tests
          </Link>
        </div>
      </div>

      {total === 0 ? (
        /* ---- Empty state ---- */
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <ListChecks className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No tests for this project yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Generate AI test cases for {repo.name} in the workspace, then run them to see coverage and
            results here.
          </p>
          <Link to={`/workspace?repo=${repo.id}`} className="btn-primary inline-flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Generate Test Cases
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
                <Link
                  to={`/workspace?repo=${repo.id}`}
                  className="ml-auto text-sm text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="divide-y divide-gray-100">
                {recent.map(tc => (
                  <Link
                    key={tc.id}
                    to={`/workspace?repo=${repo.id}&tc=${tc.id}`}
                    title="View this test case in the workspace"
                    className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors group"
                  >
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
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-700">{tc.title}</p>
                      <p className="text-xs text-gray-500 truncate">{tc.description}</p>
                    </div>
                    <span className={`badge ${TYPE_COLORS[tc.test_type] || 'badge-neutral'} shrink-0`}>
                      {tc.test_type}
                    </span>
                    <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                      {tc.duration_ms ? `${Math.round(tc.duration_ms)}ms` : '—'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                ))}
              </div>
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
                            className="h-full bg-primary-500 rounded-full transition-all"
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
