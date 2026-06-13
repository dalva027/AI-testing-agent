import { useState, useEffect } from 'react'
import axios from 'axios'
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
} from 'lucide-react'
import toast from 'react-hot-toast'

interface TestCase {
  id: number
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
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed' | 'pending'>('all')
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, pending: 0, passRate: 0 })

  const fetchResults = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/test-cases/all')
      setTestCases(res.data)

      const total = res.data.length
      const passed = res.data.filter((tc: TestCase) => tc.status === 'passed').length
      const failed = res.data.filter((tc: TestCase) => tc.status === 'failed').length
      const pending = total - passed - failed
      setStats({
        total,
        passed,
        failed,
        pending,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      })
    } catch {
      toast.error('Failed to load test results')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResults()
  }, [])

  const filtered = testCases.filter(tc => {
    if (filter === 'passed') return tc.status === 'passed'
    if (filter === 'failed') return tc.status === 'failed'
    if (filter === 'pending') return tc.status === 'generated'
    return true
  })

  const typeColors: Record<string, string> = {
    ui: 'bg-blue-100 text-blue-800',
    auth: 'bg-purple-100 text-purple-800',
    api: 'bg-green-100 text-green-800',
    form: 'bg-amber-100 text-amber-800',
    integration: 'bg-indigo-100 text-indigo-800',
    'edge-case': 'bg-rose-100 text-rose-800',
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Test Results</h1>
          <p className="text-gray-500 mt-1">Overview of all test executions across your repositories</p>
        </div>
        <button onClick={fetchResults} className="btn-secondary inline-flex items-center gap-2 self-start">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

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
          <p className="text-gray-500">Run some test cases to see results here.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Test Case</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(tc => (
                  <tr key={tc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 text-sm">{tc.title}</p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">{tc.description}</p>
                    </td>
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
