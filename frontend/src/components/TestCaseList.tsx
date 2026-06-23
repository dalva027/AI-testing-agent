import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Sparkles,
  Play,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useUser } from '../App'
import TestCaseExecutionModal from './TestCaseExecutionModal'

interface TestCase {
  id: number
  title: string
  description: string
  test_type: string
  priority: string
  target_route: string | null
  target_files: string[]
  expected_result: string | null
  playwright_script: string | null
  status: string
  logs: string[] | null
  session_id: string | null
  session_url: string | null
  error_message: string | null
  duration_ms: number | null
}

interface Props {
  repoId: number
  branch: string
  targetDomain: string
  globalInstruction: string | null
  onReload: () => void
  focusTestCaseId?: number | null
}

export default function TestCaseList({ repoId, branch, targetDomain, globalInstruction, onReload, focusTestCaseId }: Props) {
  const { user, token, setUser } = useUser()
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [executionModalOpen, setExecutionModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)

  const fetchTestCases = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/test-cases/repo/${repoId}`)
      setTestCases(res.data)
    } catch {
      toast.error('Failed to load test cases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTestCases()
  }, [repoId])

  // When deep-linked from a project page (?tc=:id), expand, scroll to, and
  // briefly highlight that specific test case once the list has loaded.
  useEffect(() => {
    if (loading || !focusTestCaseId) return
    if (!testCases.some(tc => tc.id === focusTestCaseId)) return
    setExpandedId(focusTestCaseId)
    setHighlightId(focusTestCaseId)
    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`tc-${focusTestCaseId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    const clearTimer = setTimeout(() => setHighlightId(null), 2500)
    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
  }, [loading, focusTestCaseId, testCases])

  const handleGenerate = async () => {
    if (!token) {
      toast.error('Please connect GitHub first')
      return
    }
    setGenerating(true)
    try {
      const res = await axios.post('/api/test-cases/generate', {
        repo_id: repoId,
        branch,
      })
      toast.success(`Generated ${res.data.count} test cases!`)
      if (user && typeof res.data.credits === 'number') {
        setUser({ ...user, credits: res.data.credits })
      }
      setSelectedIds(new Set())
      fetchTestCases()
      onReload()
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Failed to generate test cases'
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteTestCase = async (id: number) => {
    if (!confirm('Delete this test case?')) return
    try {
      await axios.delete(`/api/test-cases/${id}`)
      toast.success('Test case deleted')
      setTestCases(prev => prev.filter(tc => tc.id !== id))
    } catch {
      toast.error('Failed to delete')
    }
  }

  const typeColors: Record<string, string> = {
    ui: 'bg-blue-100 text-blue-800',
    auth: 'bg-purple-100 text-purple-800',
    api: 'bg-green-100 text-green-800',
    form: 'bg-amber-100 text-amber-800',
    integration: 'bg-indigo-100 text-indigo-800',
    'edge-case': 'bg-rose-100 text-rose-800',
  }

  const priorityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-4">
      {/* Generate Section */}
      <div className="bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-500/10 dark:to-purple-500/10 border border-primary-200 dark:border-primary-500/30 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-600" />
            AI Test Case Generation
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">
            Analyze repository code and generate automated test cases with AI
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-primary inline-flex items-center gap-2 shrink-0"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Test Cases
            </>
          )}
        </button>
      </div>

      {/* Test Cases List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : testCases.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No test cases yet. Click "Generate Test Cases" to create AI-powered tests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {testCases.map(tc => (
            <div
              key={tc.id}
              id={`tc-${tc.id}`}
              className={`bg-white rounded-xl border overflow-hidden transition-shadow ${
                highlightId === tc.id
                  ? 'border-primary-400 ring-2 ring-primary-300'
                  : 'border-gray-200'
              }`}
            >
              {/* Row */}
              <div className="p-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(tc.id)}
                  onChange={() => toggleSelect(tc.id)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <button
                  onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900">{tc.title}</h4>
                    <span className={`badge ${typeColors[tc.test_type] || 'badge-neutral'}`}>
                      {tc.test_type}
                    </span>
                    <span className={`badge ${priorityColors[tc.priority] || 'badge-neutral'}`}>
                      {tc.priority}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{tc.description}</p>
                </button>
                {/* Status */}
                <div className="flex items-center gap-2 shrink-0">
                  {tc.status === 'passed' && (
                    <span className="badge badge-passed"><CheckCircle2 className="w-3 h-3" /> Passed</span>
                  )}
                  {tc.status === 'failed' && (
                    <span className="badge badge-failed"><XCircle className="w-3 h-3" /> Failed</span>
                  )}
                  {tc.status === 'generated' && (
                    <span className="badge badge-pending"><Clock className="w-3 h-3" /> Pending</span>
                  )}
                  {tc.status === 'running' && (
                    <span className="badge badge-info"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>
                  )}
                  <button
                    onClick={() => deleteTestCase(tc.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {expandedId === tc.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Expanded */}
              {expandedId === tc.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Target Route:</span>
                      <p className="font-mono text-primary-600 mt-0.5">{tc.target_route || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Expected Result:</span>
                      <p className="mt-0.5">{tc.expected_result || 'N/A'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-gray-500">Target Files:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {tc.target_files?.map((f, i) => (
                          <span key={i} className="text-xs font-mono bg-white border border-gray-200 px-2 py-0.5 rounded">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {tc.playwright_script && (
                    <div>
                      <span className="text-gray-500 text-sm">Playwright Script:</span>
                      <pre className="mt-1 bg-gray-900 text-gray-300 p-3 rounded-lg text-xs overflow-x-auto max-h-40 overflow-y-auto">
                        {tc.playwright_script}
                      </pre>
                    </div>
                  )}
                  {tc.logs && tc.logs.length > 0 && (
                    <div>
                      <span className="text-gray-500 text-sm">Logs:</span>
                      <pre className="mt-1 bg-gray-950 text-gray-300 p-3 rounded-lg text-xs overflow-x-auto max-h-40 overflow-y-auto">
                        {tc.logs.map((log, i) => (
                          <div key={i} className={
                            log.startsWith('[SYSTEM ERROR]') ? 'text-red-400' :
                            log.startsWith('[SYSTEM]') ? 'text-blue-400' :
                            log.startsWith('[BROWSER]') ? 'text-purple-400' :
                            'text-gray-300'
                          }>{log}</div>
                        ))}
                      </pre>
                    </div>
                  )}
                  {tc.session_url && (
                    <a href={tc.session_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                      View Session <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Run Bar */}
          {selectedIds.size > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-white text-sm">
                <span className="font-medium">{selectedIds.size}</span> test case{selectedIds.size > 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setExecutionModalOpen(true)}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Run Selected
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <TestCaseExecutionModal
        isOpen={executionModalOpen}
        onClose={() => { setExecutionModalOpen(false); onReload() }}
        testCases={testCases.filter(tc => selectedIds.has(tc.id))}
        repository={{ target_domain: targetDomain, global_instruction: globalInstruction }}
        repoId={repoId}
      />
    </div>
  )
}
