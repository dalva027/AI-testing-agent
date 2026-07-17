import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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
  FolderGit2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useUser } from '../App'
import TestCaseList from '../components/TestCaseList'
import RepoSettingsDialog from '../components/RepoSettingsDialog'

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
  global_instruction: string | null
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [repo, setRepo] = useState<Repo | null>(null)
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // silent=true refreshes data without the full-page spinner — the early-return
  // spinner would unmount TestCaseList (and any open execution modal) mid-run.
  const fetchData = useCallback(async (silent = false) => {
    if (!token || !repoId) {
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
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
      if (!silent) setLoading(false)
    }
  }, [token, repoId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ?settings=1 deep link (e.g. right after adding a repo with no target URL):
  // auto-open the settings dialog once, then strip the param so back/refresh
  // doesn't re-open it. Only `settings` is removed — a ?tc focus param survives.
  useEffect(() => {
    if (loading || !repo) return
    if (searchParams.get('settings')) {
      setSettingsOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('settings')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, repo])

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
        <p className="text-gray-500 mb-6">It may have been removed from your projects.</p>
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
              {repo.target_domain ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                  <Globe className="w-3 h-3" />
                  {repo.target_domain}
                </span>
              ) : (
                <button
                  onClick={() => setSettingsOpen(true)}
                  title="Open repository settings to set a target URL"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors"
                >
                  <Globe className="w-3 h-3" />
                  No target URL — runs disabled
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => fetchData()} className="btn-secondary inline-flex items-center gap-2">
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
          <RepoSettingsDialog
            repo={repo}
            onSaved={() => fetchData(true)}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        </div>
      </div>

      {total > 0 && (
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
            <div className="card lg:col-span-2 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 shrink-0">
                <Activity className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-900">Recent Test Cases</h3>
                <a
                  href="#test-cases"
                  className="ml-auto text-sm text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              {/* At lg the card is stretched to the sibling column's height; the
                  absolutely-positioned list fills that space exactly and scrolls
                  past it, instead of a fixed 6 rows leaving a blank gap. */}
              <div className="flex-1 lg:relative lg:min-h-[20rem]">
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto lg:max-h-none lg:absolute lg:inset-0">
                {recent.map(tc => (
                  <button
                    key={tc.id}
                    onClick={() => {
                      const next = new URLSearchParams(searchParams)
                      next.set('tc', String(tc.id))
                      setSearchParams(next, { replace: true })
                    }}
                    title="View this test case below"
                    className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors group"
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
                  </button>
                ))}
                </div>
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

      {/* Test cases (full management: expand, run, generate, delete) */}
      <div id="test-cases" className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Test Cases</h2>
        <TestCaseList
          repoId={repo.id}
          branch={repo.default_branch}
          targetDomain={repo.target_domain}
          globalInstruction={repo.global_instruction}
          onReload={() => fetchData(true)}
          focusTestCaseId={Number(searchParams.get('tc')) || null}
        />
      </div>
    </div>
  )
}
