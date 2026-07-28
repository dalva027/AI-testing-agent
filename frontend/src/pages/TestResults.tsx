import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { githubLoginUrl } from '../lib/api'
import { startGithubLogin } from '../lib/coldStart'
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  TrendingUp,
  ListChecks,
  Filter,
  Github,
  Download,
  FolderGit2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { TrendChart, StackedBarChart, DonutChart } from '../components/Charts'
import { useUser } from '../App'

// Each AI test-case generation costs this many credits (mirrors the backend).
const GENERATION_COST = 200

// Brand palette: lime family for core types, tertiary illustration accents
// (cyan/orange) and semantic hues for the rest — see DESIGN.md.
const TYPE_HEX: Record<string, string> = {
  ui: '#38c8ff',
  auth: '#ffc091',
  api: '#2ead4b',
  form: '#ffd11a',
  integration: '#6d7263',
  'edge-case': '#d03238',
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Trigger a client-side file download of in-memory content (no backend call).
function downloadFile(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface TestCase {
  id: number
  repo_id: number | null
  repo_name: string
  title: string
  description: string
  test_type: string
  priority: string
  status: string
  logs: string[] | null
  duration_ms: number | null
  created_at: string
  session_url: string | null
}

export default function TestResults() {
  const { token } = useUser()
  const navigate = useNavigate()
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed' | 'pending'>('all')
  // Selected project (repo id) that scopes the whole page, or 'all'.
  const [selectedProject, setSelectedProject] = useState<number | 'all'>('all')

  const fetchResults = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await axios.get('/api/test-cases/all')
      setTestCases(res.data)
    } catch {
      toast.error('Failed to load test results')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  // Distinct projects present in the results, for the project selector.
  const projects = useMemo(() => {
    const map = new Map<number, string>()
    testCases.forEach(tc => {
      if (tc.repo_id != null) map.set(tc.repo_id, tc.repo_name)
    })
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [testCases])

  // If the selected project disappears (e.g. after a refresh), fall back to All.
  useEffect(() => {
    if (selectedProject !== 'all' && !projects.some(p => p.id === selectedProject)) {
      setSelectedProject('all')
    }
  }, [projects, selectedProject])

  // Everything below (stats, charts, table, export) is scoped to this set.
  const scoped = useMemo(
    () => (selectedProject === 'all' ? testCases : testCases.filter(tc => tc.repo_id === selectedProject)),
    [testCases, selectedProject]
  )

  const stats = useMemo(() => {
    const total = scoped.length
    const passed = scoped.filter(tc => tc.status === 'passed').length
    const failed = scoped.filter(tc => tc.status === 'failed').length
    const pending = total - passed - failed
    return { total, passed, failed, pending, passRate: total > 0 ? Math.round((passed / total) * 100) : 0 }
  }, [scoped])

  const selectedProjectName =
    selectedProject === 'all' ? null : projects.find(p => p.id === selectedProject)?.name ?? null

  const filtered = scoped.filter(tc => {
    if (filter === 'passed') return tc.status === 'passed'
    if (filter === 'failed') return tc.status === 'failed'
    if (filter === 'pending') return tc.status === 'generated'
    return true
  })

  // ---- Chart datasets (derived from the live test cases) ----
  const charts = useMemo(() => {
    const byDay = new Map<
      string,
      { passed: number; failed: number; generations: Set<string> }
    >()
    for (const tc of scoped) {
      if (!tc.created_at) continue
      const key = dayKey(tc.created_at)
      let entry = byDay.get(key)
      if (!entry) {
        entry = { passed: 0, failed: 0, generations: new Set() }
        byDay.set(key, entry)
      }
      if (tc.status === 'passed') entry.passed++
      else if (tc.status === 'failed') entry.failed++
      // All test cases from one /generate call share an exact created_at, so a
      // distinct timestamp == one generation batch == one GENERATION_COST charge.
      entry.generations.add(tc.created_at)
    }

    const days = [...byDay.keys()].sort()
    const short = (k: string) => k.slice(5)

    let cumP = 0
    let cumF = 0
    const passRate = days.map(k => {
      const e = byDay.get(k)!
      cumP += e.passed
      cumF += e.failed
      const denom = cumP + cumF
      return { label: short(k), value: denom > 0 ? Math.round((cumP / denom) * 100) : 0 }
    })

    const passedVsFailed = days.map(k => {
      const e = byDay.get(k)!
      return { label: short(k), passed: e.passed, failed: e.failed }
    })

    const credits = days.map(k => {
      const e = byDay.get(k)!
      return { label: short(k), value: e.generations.size * GENERATION_COST }
    })

    // The AI sometimes emits compound types ("ui|integration"); bucket each test
    // by its primary type so coverage slices stay clean, colored, and sum to total.
    const typeCount = new Map<string, number>()
    for (const tc of scoped) {
      const primary = (tc.test_type || 'other').split('|')[0].trim() || 'other'
      typeCount.set(primary, (typeCount.get(primary) || 0) + 1)
    }
    const coverage = [...typeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, value]) => ({ label: type, value, color: TYPE_HEX[type] || '#868685' }))

    return { passRate, passedVsFailed, credits, coverage }
  }, [scoped])

  const typeColors: Record<string, string> = {
    ui: 'bg-blue-100 text-blue-800',
    auth: 'bg-purple-100 text-purple-800',
    api: 'bg-green-100 text-green-800',
    form: 'bg-amber-100 text-amber-800',
    integration: 'bg-indigo-100 text-indigo-800',
    'edge-case': 'bg-rose-100 text-rose-800',
  }

  const exportBaseName = selectedProjectName
    ? `test-results-${selectedProjectName.replace(/[^a-z0-9]+/gi, '-')}`
    : 'test-results'

  const exportJson = () => {
    downloadFile(JSON.stringify(scoped, null, 2), 'application/json', `${exportBaseName}.json`)
  }

  const exportCsv = () => {
    const headers = ['id', 'project', 'title', 'type', 'priority', 'status', 'duration_ms', 'created_at']
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = scoped.map(tc =>
      [tc.id, tc.repo_name, tc.title, tc.test_type, tc.priority, tc.status, tc.duration_ms ?? '', tc.created_at]
        .map(escape)
        .join(',')
    )
    downloadFile([headers.join(','), ...rows].join('\n'), 'text/csv', `${exportBaseName}.csv`)
  }

  // ---- Not authenticated ----
  if (!token) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto mt-10">
        <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Github className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-gray-900 mb-2">Connect GitHub to get started</h2>
        <p className="text-gray-500 mb-6">
          Test results are tracked per account. Connect a GitHub account to view your test executions.
        </p>
        <a href={githubLoginUrl} onClick={startGithubLogin} className="btn-primary inline-flex items-center gap-2">
          <Github className="w-4 h-4" />
          Connect GitHub
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Test Results</h1>
          <p className="text-gray-500 mt-1">
            {selectedProjectName
              ? `Test executions for ${selectedProjectName}`
              : 'Overview of test executions across your repositories'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={exportCsv}
            disabled={scoped.length === 0}
            title="Export results as CSV"
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={exportJson}
            disabled={scoped.length === 0}
            title="Export results as JSON"
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
          <button onClick={fetchResults} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Project selector */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <FolderGit2 className="w-4 h-4 text-gray-400 shrink-0" />
          <button
            onClick={() => setSelectedProject('all')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedProject === 'all' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            All Projects
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedProject === p.id ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Tests', value: stats.total, icon: ListChecks, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Passed', value: stats.passed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Pass Rate', value: `${stats.passRate}%`, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
        ].map((stat, i) => (
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

      {/* Charts */}
      {!loading && scoped.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Pass rate over time</h3>
            <TrendChart
              data={charts.passRate}
              color="#163300"
              fmt={v => `${Math.round(v)}%`}
              valueLabel="Pass rate"
              clampMin={0}
              clampMax={100}
            />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Passed vs failed (daily)</h3>
            <StackedBarChart data={charts.passedVsFailed} />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">AI spend over time (credits)</h3>
            <TrendChart
              data={charts.credits}
              color="#b86700"
              area
              fmt={v => `${Math.round(v)}`}
              valueLabel="Credits"
              clampMin={0}
            />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Coverage by test type</h3>
            <DonutChart data={charts.coverage} />
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        {(['all', 'passed', 'failed', 'pending'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({f === 'passed' ? stats.passed : f === 'failed' ? stats.failed : stats.pending})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Yet</h3>
          <p className="text-gray-500">
            {selectedProjectName ? `No results for ${selectedProjectName} yet.` : 'Run some test cases to see results here.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Test Case</th>
                  {selectedProject === 'all' && (
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Project</th>
                  )}
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(tc => (
                  <tr
                    key={tc.id}
                    onClick={() => { if (tc.repo_id) navigate(`/dashboard/${tc.repo_id}?tc=${tc.id}`) }}
                    title={tc.repo_id ? 'Open in project dashboard' : undefined}
                    className={`transition-colors ${tc.repo_id ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 text-sm">{tc.title}</p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">{tc.description}</p>
                    </td>
                    {selectedProject === 'all' && (
                      <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">{tc.repo_name}</td>
                    )}
                    <td className="px-5 py-4">
                      <span className={`badge ${typeColors[tc.test_type] || 'badge-neutral'}`}>
                        {tc.test_type}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {tc.status === 'passed' && (
                        <span className="inline-flex items-center gap-1 badge badge-passed">
                          <CheckCircle2 className="w-3 h-3" /> Passed
                        </span>
                      )}
                      {tc.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 badge badge-failed">
                          <XCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                      {tc.status === 'generated' && (
                        <span className="inline-flex items-center gap-1 badge badge-pending">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {tc.duration_ms ? `${Math.round(tc.duration_ms)}ms` : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500">
                      {tc.created_at ? new Date(tc.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
