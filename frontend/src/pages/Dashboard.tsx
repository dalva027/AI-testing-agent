import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { githubLoginUrl } from '../lib/api'
import { startGithubLogin } from '../lib/coldStart'
import {
  FolderGit2,
  ListChecks,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Loader2,
  Github,
  Plus,
  ArrowRight,
  Bot,
  GitBranch,
  Circle,
  X,
  Search,
  Trash2,
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useUser } from '../App'
import ConfirmDialog from '../components/ui/ConfirmDialog'

interface TestCase {
  id: number
  status: string
  test_type: string
  duration_ms: number | null
  created_at: string
  repo_id: number | null
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

interface ProjectStats {
  total: number
  passed: number
  failed: number
  pending: number
  passRate: number
  lastActivity: number | null
}

function computeStats(cases: TestCase[]): ProjectStats {
  const total = cases.length
  const passed = cases.filter(c => c.status === 'passed').length
  const failed = cases.filter(c => c.status === 'failed').length
  const pending = total - passed - failed
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  const lastActivity = cases.reduce<number | null>((acc, c) => {
    const t = new Date(c.created_at).getTime()
    return acc === null || t > acc ? t : acc
  }, null)
  return { total, passed, failed, pending, passRate, lastActivity }
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'No runs yet'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Dashboard() {
  const { user, token } = useUser()
  const navigate = useNavigate()
  const [repos, setRepos] = useState<Repo[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [gsDismissed, setGsDismissed] = useState(() => localStorage.getItem('qa-gs-dismissed') === '1')
  const [showRepoDialog, setShowRepoDialog] = useState(false)
  const [githubRepos, setGithubRepos] = useState<any[]>([])
  const [githubLoading, setGithubLoading] = useState(false)
  // Repo awaiting remove confirmation (null = dialog closed).
  const [confirmRepo, setConfirmRepo] = useState<Repo | null>(null)

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
      toast.error('Failed to load projects')
      setRepos([])
      setTestCases([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleConnectGitHub = () => {
    setShowRepoDialog(true)
    fetchGithubRepos()
  }

  const fetchGithubRepos = async () => {
    if (!token) return
    setGithubLoading(true)
    try {
      const res = await axios.get('/api/repos/github')
      setGithubRepos(res.data)
    } catch {
      toast.error('Failed to fetch GitHub repos')
    } finally {
      setGithubLoading(false)
    }
  }

  const addRepo = async (ghRepo: any) => {
    try {
      const res = await axios.post('/api/repos', {
        repo_id: ghRepo.id,
        name: ghRepo.name,
        full_name: ghRepo.full_name,
        html_url: ghRepo.html_url,
        owner: ghRepo.owner.login,
        description: ghRepo.description,
        language: ghRepo.language,
        default_branch: ghRepo.default_branch,
      })
      toast.success(`Added ${ghRepo.full_name}`)
      setShowRepoDialog(false)
      // New repos have no target URL: send the user straight to the project
      // page with the settings dialog auto-opened (runs are blocked until a
      // target URL is set). Re-adding an already-configured repo returns the
      // existing row → stay on the grid, no nag.
      if (!res.data.target_domain) {
        toast('Test runs are disabled until you set a target URL for this repo.', { icon: '⚠️' })
        navigate(`/dashboard/${res.data.id}?settings=1`)
      } else {
        await fetchData()
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to add repo')
    }
  }

  const performRemoveRepo = async (repoId: number) => {
    try {
      await axios.delete(`/api/repos/${repoId}`)
      toast.success('Repository removed')
      fetchData()
    } catch {
      toast.error('Failed to remove repo')
    }
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
          Your projects track tests across your repositories. Connect a GitHub account to begin.
        </p>
        <a href={githubLoginUrl} onClick={startGithubLogin} className="btn-primary inline-flex items-center gap-2">
          <Github className="w-4 h-4" />
          Connect GitHub
        </a>
      </div>
    )
  }

  // ---- Aggregates ----
  const total = testCases.length
  const passed = testCases.filter(tc => tc.status === 'passed').length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  const byRepo = new Map<number, TestCase[]>()
  for (const tc of testCases) {
    if (tc.repo_id == null) continue
    const arr = byRepo.get(tc.repo_id)
    if (arr) arr.push(tc)
    else byRepo.set(tc.repo_id, [tc])
  }

  const projects = repos
    .map(repo => ({ repo, stats: computeStats(byRepo.get(repo.id) || []) }))
    .sort(
      (a, b) =>
        (b.stats.lastActivity ?? 0) - (a.stats.lastActivity ?? 0) ||
        b.stats.total - a.stats.total
    )

  const summaryCards = [
    { label: 'Projects', value: repos.length, icon: FolderGit2, color: 'text-gray-900', bg: 'bg-gray-50' },
    { label: 'Total Tests', value: total, icon: ListChecks, color: 'text-gray-900', bg: 'bg-gray-50' },
    { label: 'Passed', value: passed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Pass Rate', value: `${passRate}%`, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
  ]

  // First-run checklist, derived from existing state (no extra requests).
  const gettingStartedSteps = [
    { label: 'Connect GitHub', done: !!token },
    { label: 'Add a repository', done: repos.length > 0 },
    {
      label: 'Set a target URL (open a project → settings)',
      done: repos.some(r => !!r.target_domain),
    },
    { label: 'Generate test cases', done: testCases.length > 0 },
    { label: 'Run a test', done: testCases.some(tc => tc.status === 'passed' || tc.status === 'failed') },
  ]
  const allStepsDone = gettingStartedSteps.every(s => s.done)
  const dismissGettingStarted = () => {
    setGsDismissed(true)
    localStorage.setItem('qa-gs-dismissed', '1')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">
            {user?.name ? `Welcome back, ${user.name}` : 'Projects'}
          </h1>
          <p className="text-gray-500 mt-1">Your repositories and their test coverage at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/agent" className="btn-secondary inline-flex items-center gap-2">
            <Bot className="w-4 h-4" />
            AI Agent
          </Link>
          <button onClick={fetchData} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={handleConnectGitHub} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Repository
          </button>
        </div>
      </div>

      {!loading && !gsDismissed && !allStepsDone && (
        <div className="card p-5 relative">
          <button
            onClick={dismissGettingStarted}
            aria-label="Dismiss getting started"
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <h3 className="font-semibold text-gray-900 mb-1">Getting started</h3>
          <p className="text-sm text-gray-500 mb-4">
            Follow these steps to run your first AI test. Generating test cases costs 200 credits.
          </p>
          <ol className="space-y-2">
            {gettingStartedSteps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {s.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                )}
                <span className={s.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : repos.length === 0 ? (
        /* ---- Empty state ---- */
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <FolderGit2 className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add a repository and generate your first set of AI test cases — each project will show its
            coverage here.
          </p>
          <button onClick={handleConnectGitHub} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Your First Repository
          </button>
        </div>
      ) : (
        <>
          {/* Global summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map((stat, i) => (
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

          {/* Projects grid */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map(({ repo, stats }) => (
                <Link
                  key={repo.id}
                  to={`/dashboard/${repo.id}`}
                  className="card card-hover p-5 block group"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                        <FolderGit2 className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{repo.name}</h3>
                        <p className="text-xs text-gray-400 truncate">{repo.full_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-1">
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/dashboard/${repo.id}/agent`) }}
                        aria-label={`Open AI agent for ${repo.name}`}
                        title="AI Agent"
                        className="p-1.5 text-gray-300 hover:text-primary-600 transition-colors"
                      >
                        <Bot className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmRepo(repo) }}
                        aria-label="Remove repository"
                        className="p-1.5 text-gray-300 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-3">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5" />
                      {repo.default_branch}
                    </span>
                    {repo.language && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        {repo.language}
                      </span>
                    )}
                  </div>

                  {/* Counts */}
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="bg-gray-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-gray-900 leading-none">{stats.total}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Tests</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-emerald-600 leading-none">{stats.passed}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Passed</p>
                    </div>
                    <div className="bg-rose-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-rose-600 leading-none">{stats.failed}</p>
                      <p className="text-[11px] text-gray-500 mt-1">Failed</p>
                    </div>
                  </div>

                  {/* Pass rate */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Pass rate</span>
                      <span className="font-medium text-gray-900">{stats.passRate}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${stats.passRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <p className="text-[11px] text-gray-400 mt-3">
                    {stats.total === 0 ? 'No tests generated yet' : `Updated ${timeAgo(stats.lastActivity)}`}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* GitHub Repo Selection Dialog */}
      {showRepoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Add Repository</h3>
              <button onClick={() => setShowRepoDialog(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search repos..."
                  className="input pl-10"
                  onKeyDown={e => {
                    if (e.key === 'Escape') setShowRepoDialog(false)
                  }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {githubLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : (
                <div className="space-y-2">
                  {githubRepos.map(repo => (
                    <button
                      key={repo.id}
                      onClick={() => addRepo(repo)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50/50 transition-all"
                    >
                      <div className="font-medium text-gray-900">{repo.full_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {repo.description || 'No description'} • {repo.language || 'Unknown'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRepo !== null}
        onOpenChange={open => { if (!open) setConfirmRepo(null) }}
        title="Remove repository?"
        description={confirmRepo ? `${confirmRepo.full_name} and its test cases will be removed from your projects.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (confirmRepo) performRemoveRepo(confirmRepo.id) }}
      />
    </div>
  )
}
