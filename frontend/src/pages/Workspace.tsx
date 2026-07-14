import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { githubLoginUrl } from '../lib/api'
import {
  Github,
  FolderGit2,
  Plus,
  Search,
  X,
  Trash2,
  ExternalLink,
  Loader2,
  Globe,
} from 'lucide-react'
import { useUser } from '../App'
import TestCaseList from '../components/TestCaseList'
import RepoSettingsDialog from '../components/RepoSettingsDialog'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface Repo {
  id: number
  repo_id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  owner: string
  language: string | null
  default_branch: string
  target_domain: string | null
  global_instruction: string | null
}

interface Stats {
  total_tests: number
  passed_tests: number
  failed_tests: number
  pending_tests: number
  pass_rate: number
}

export default function Workspace() {
  const { token } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [repos, setRepos] = useState<Repo[]>([])
  const [githubRepos, setGithubRepos] = useState<any[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRepoDialog, setShowRepoDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [githubLoading, setGithubLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  // Repo awaiting remove confirmation (null = dialog closed).
  const [confirmRepo, setConfirmRepo] = useState<Repo | null>(null)
  // Repo whose settings dialog is open (controlled so we can auto-open it
  // right after connecting a repo that has no target URL yet).
  const [settingsOpenRepoId, setSettingsOpenRepoId] = useState<number | null>(null)

  const fetchRepos = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const res = await axios.get('/api/repos')
      setRepos(res.data)
    } catch {
      setRepos([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  const handleConnectGitHub = () => {
    if (!token) {
      toast.error('Please connect GitHub first')
      return
    }
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
      await fetchRepos()
      // New repos have no target URL: expand the repo and open its settings
      // so the user configures one right away (runs are blocked until then).
      // Re-adding an already-configured repo returns the existing row → no nag.
      if (!res.data.target_domain) {
        // A stale ?repo= deep-link would re-select that repo when `repos`
        // refreshes and bury the auto-opened dialog — drop it first.
        if (searchParams.get('repo')) setSearchParams({}, { replace: true })
        setSelectedRepo(res.data)
        loadStats(res.data.id)
        setSettingsOpenRepoId(res.data.id)
        toast('Test runs are disabled until you set a target URL for this repo.', { icon: '⚠️' })
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to add repo')
    }
  }

  const performRemoveRepo = async (repoId: number) => {
    try {
      await axios.delete(`/api/repos/${repoId}`)
      toast.success('Repository removed')
      if (selectedRepo?.id === repoId) setSelectedRepo(null)
      fetchRepos()
    } catch {
      toast.error('Failed to remove repo')
    }
  }

  const loadStats = async (repoId: number) => {
    setStatsLoading(true)
    try {
      const res = await axios.get(`/api/test-cases/stats/${repoId}`)
      setStats(res.data)
    } catch {
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  // Deep link from a project page (/workspace?repo=:id): auto-open that repo.
  // Each param value is consumed once — otherwise the effect re-fires on every
  // `repos` refresh and steals the selection from later user actions (e.g. the
  // auto-expanded repo right after connecting one).
  const consumedRepoParam = useRef<string | null>(null)
  useEffect(() => {
    const repoParam = searchParams.get('repo')
    if (!repoParam || repos.length === 0) return
    if (consumedRepoParam.current === repoParam) return
    const target = repos.find(r => String(r.id) === repoParam)
    if (target && selectedRepo?.id !== target.id) {
      consumedRepoParam.current = repoParam
      setSelectedRepo(target)
      loadStats(target.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, searchParams])

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Workspace</h1>
          <p className="text-gray-500 mt-1">Manage your connected repositories and test cases</p>
        </div>
        <div className="flex items-center gap-3">
          {token && (
            <button onClick={handleConnectGitHub} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Repository
            </button>
          )}
        </div>
      </div>

      {!token && (
        <div className="card p-8 text-center">
          <Github className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect GitHub to Get Started</h3>
          <p className="text-gray-500 mb-4">Link your GitHub account to import repositories and start generating test cases.</p>
          <a
            href={githubLoginUrl}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Github className="w-4 h-4" />
            Connect GitHub
          </a>
        </div>
      )}

      {/* Repo List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : repos.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderGit2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Repositories Yet</h3>
          <p className="text-gray-500 mb-6">Connect your GitHub account and add a repository to start testing.</p>
          {token && (
            <button onClick={handleConnectGitHub} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Repo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="space-y-4">
            {filteredRepos.map(repo => (
              <div key={repo.id} className="card card-hover overflow-hidden">
                {/* Repo Header */}
                <div
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => {
                    setSelectedRepo(selectedRepo?.id === repo.id ? null : repo)
                    loadStats(repo.id)
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <FolderGit2 className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{repo.full_name}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                        <span>{repo.default_branch}</span>
                        {repo.language && <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />}
                        <span>{repo.language}</span>
                        {repo.description && (
                          <span className="max-w-xs truncate">{repo.description}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmRepo(repo) }}
                      aria-label="Remove repository"
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {selectedRepo?.id === repo.id && (
                  <div className="border-t border-gray-100 p-5 bg-gray-50/50 space-y-5">
                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {[
                        { label: 'Total Tests', value: stats?.total_tests ?? 0, color: 'text-gray-900' },
                        { label: 'Passed', value: stats?.passed_tests ?? 0, color: 'text-emerald-600' },
                        { label: 'Failed', value: stats?.failed_tests ?? 0, color: 'text-rose-600' },
                        { label: 'Pending', value: stats?.pending_tests ?? 0, color: 'text-amber-600' },
                        { label: 'Pass Rate', value: `${stats?.pass_rate ?? 0}%`, color: 'text-primary-600' },
                      ].map((stat, i) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                          <p className="text-xs text-gray-500">{stat.label}</p>
                          <p className={`text-xl font-bold mt-0.5 ${stat.color}`}>
                            {statsLoading && i !== 0 ? (
                              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                            ) : (
                              stat.value
                            )}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Target Domain */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">Target Domain:</span>
                        {repo.target_domain ? (
                          <span className="text-sm font-mono font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                            {repo.target_domain}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            Not configured
                          </span>
                        )}
                        <div className="ml-auto">
                          <RepoSettingsDialog
                            repo={repo}
                            onSaved={() => fetchRepos()}
                            open={settingsOpenRepoId === repo.id}
                            onOpenChange={o => setSettingsOpenRepoId(o ? repo.id : null)}
                          />
                        </div>
                      </div>
                      {!repo.target_domain && (
                        <p className="text-xs text-amber-600 inline-flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          No target URL set — test runs are disabled until you set one.
                        </p>
                      )}
                    </div>

                    {/* Test Case Actions */}
                    <TestCaseList
                      repoId={repo.id}
                      branch={repo.default_branch}
                      targetDomain={repo.target_domain}
                      globalInstruction={repo.global_instruction}
                      onReload={() => loadStats(repo.id)}
                      focusTestCaseId={
                        String(repo.id) === searchParams.get('repo')
                          ? Number(searchParams.get('tc')) || null
                          : null
                      }
                    />
                  </div>
                )}
              </div>
            ))}
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
        description={confirmRepo ? `${confirmRepo.full_name} and its test cases will be removed from your workspace.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (confirmRepo) performRemoveRepo(confirmRepo.id) }}
      />
    </div>
  )
}
