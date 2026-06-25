import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Terminal,
  ExternalLink,
  Code,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react'

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

interface Repo {
  target_domain?: string
  global_instruction?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  testCases: TestCase[]
  repository: Repo
  repoId: number
  // Begin executing immediately on open (used for single-test "Run Test").
  autoStart?: boolean
}

type RunResult = {
  testCaseId: number
  status: 'idle' | 'generating' | 'running' | 'passed' | 'failed'
  logs: string[]
  error?: string
  sessionUrl?: string
  playwrightScript?: string
  duration_ms?: number
}

export default function TestCaseExecutionModal({ isOpen, onClose, testCases, repository, autoStart = false }: Props) {
  const [baseUrl, setBaseUrl] = useState(repository.target_domain || 'http://localhost:5173')
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [isExecuting, setIsExecuting] = useState(false)
  const [results, setResults] = useState<Record<number, RunResult>>({})
  const [selectedDetail, setSelectedDetail] = useState<number | null>(null)
  const [executionMode, setExecutionMode] = useState<'cache' | 'generate'>('generate')
  const [customPrompt, setCustomPrompt] = useState('')
  const [showOptions, setShowOptions] = useState(false)

  useEffect(() => {
    if (isOpen && testCases.length > 0) {
      const initial: Record<number, RunResult> = {}
      testCases.forEach(tc => {
        initial[tc.id] = {
          testCaseId: tc.id,
          status: tc.status === 'passed' || tc.status === 'failed' ? tc.status : 'idle',
          logs: tc.logs || ['Waiting to run...'],
          playwrightScript: tc.playwright_script || undefined,
          sessionUrl: tc.session_url || undefined,
          duration_ms: tc.duration_ms || undefined,
        }
      })
      setResults(initial)
      setSelectedDetail(testCases[0]?.id ?? null)
      setBaseUrl(repository.target_domain || 'http://localhost:5173')
      // Auto-start kicks off sequential execution from the first test case;
      // otherwise wait for the user to press "Run All".
      setCurrentIdx(autoStart ? 0 : -1)
      setIsExecuting(autoStart)
    }
  }, [isOpen, testCases, repository, autoStart])

  // Sequential execution
  useEffect(() => {
    if (!isExecuting || currentIdx < 0 || currentIdx >= testCases.length) {
      if (currentIdx >= testCases.length) setIsExecuting(false)
      return
    }

    const runTest = async () => {
      const tc = testCases[currentIdx]
      setSelectedDetail(tc.id)

      const needsRegen = executionMode === 'generate' || !results[tc.id]?.playwrightScript

      setResults(prev => ({
        ...prev,
        [tc.id]: {
          ...prev[tc.id],
          status: needsRegen ? 'generating' : 'running',
          logs: [
            needsRegen
              ? '[SYSTEM] Analyzing code and generating Playwright script...'
              : '[SYSTEM] Using cached Playwright script, preparing execution...',
          ],
        },
      }))

      try {
        const res = await axios.post('/api/test-cases/run', {
          test_case_ids: [tc.id],
          base_url: baseUrl,
          mode: executionMode,
          custom_prompt: customPrompt || undefined,
        })

        const result = res.data.results?.[0]
        if (result) {
          setResults(prev => ({
            ...prev,
            [tc.id]: {
              testCaseId: tc.id,
              status: result.status,
              logs: result.logs,
              error: result.error,
              playwrightScript: result.playwright_script,
              duration_ms: result.duration_ms,
            },
          }))
        }
      } catch (e: any) {
        const errorMsg = e.response?.data?.detail || 'Execution failed'
        setResults(prev => ({
          ...prev,
          [tc.id]: {
            ...prev[tc.id],
            status: 'failed',
            logs: [...(prev[tc.id]?.logs || []), `[ERROR] ${errorMsg}`],
            error: errorMsg,
          },
        }))
      }

      setCurrentIdx(prev => prev + 1)
    }

    runTest()
  }, [isExecuting, currentIdx, testCases, baseUrl, executionMode, customPrompt])

  const handleStart = () => {
    if (testCases.length === 0) return
    setCurrentIdx(0)
    setIsExecuting(true)
  }

  // Reset prior results to idle and run the whole selected batch again.
  const handleRunAgain = () => {
    if (testCases.length === 0) return
    const reset: Record<number, RunResult> = {}
    testCases.forEach(tc => {
      reset[tc.id] = {
        testCaseId: tc.id,
        status: 'idle',
        logs: ['Waiting to run...'],
        // Keep the script reference so 'cache' mode shows the right status label.
        playwrightScript: results[tc.id]?.playwrightScript || tc.playwright_script || undefined,
      }
    })
    setResults(reset)
    setSelectedDetail(testCases[0]?.id ?? null)
    setCurrentIdx(0)
    setIsExecuting(true)
  }

  const handleStop = () => {
    setIsExecuting(false)
  }

  const allDone = !isExecuting && testCases.every(tc => {
    const r = results[tc.id]
    return r && r.status !== 'idle' && r.status !== 'generating' && r.status !== 'running'
  })

  if (!isOpen) return null

  const currentResult = selectedDetail ? results[selectedDetail] : null
  const currentTestCase = testCases.find(tc => tc.id === selectedDetail)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Test Execution</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {testCases.length} test case{testCases.length > 1 ? 's' : ''} • {baseUrl}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left Panel - Queue */}
          <div className="lg:w-96 border-r border-gray-200 flex flex-col shrink-0">
            {/* Options */}
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Base URL</span>
                <button onClick={() => setShowOptions(!showOptions)} className="text-sm text-primary-600 hover:text-primary-700">
                  {showOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                className="input text-sm font-mono"
                placeholder="http://localhost:5173"
              />
              {showOptions && (
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Mode</span>
                    <div className="flex gap-2 mt-1">
                      {(['generate', 'cache'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setExecutionMode(mode)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            executionMode === mode
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {mode === 'generate' ? 'Generate Script' : 'Use Cached'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">Custom Prompt (optional)</span>
                    <textarea
                      value={customPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                      className="input mt-1 text-sm h-20 resize-none"
                      placeholder="Additional instructions for the AI..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test Queue */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {testCases.map((tc, idx) => {
                const r = results[tc.id]
                const isCurrent = currentIdx === idx && isExecuting
                const isCompleted = r && r.status !== 'idle' && r.status !== 'generating' && r.status !== 'running'
                const isSelected = selectedDetail === tc.id

                return (
                  <button
                    key={tc.id}
                    onClick={() => setSelectedDetail(tc.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'border-primary-300 bg-primary-50'
                        : isCurrent
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300'
                    } ${isCompleted ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                      {isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      ) : isCompleted && r.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : isCompleted && r.status === 'failed' ? (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{tc.title}</p>
                        <p className="text-xs text-gray-500 truncate">{tc.description}</p>
                      </div>
                      {r && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          r.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                          r.status === 'generating' ? 'bg-blue-100 text-blue-700' :
                          r.status === 'running' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {r.status}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 flex items-center gap-3 shrink-0">
              {allDone ? (
                <>
                  <button onClick={handleRunAgain} className="btn-primary flex-1 justify-center">
                    <RotateCcw className="w-4 h-4" />
                    Run Again
                  </button>
                  <button onClick={onClose} className="btn-secondary justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                  </button>
                </>
              ) : isExecuting ? (
                <>
                  <button onClick={handleStop} className="btn-secondary flex-1 justify-center">
                    Stop
                  </button>
                  <span className="text-xs text-gray-500">
                    Running {currentIdx + 1}/{testCases.length}
                  </span>
                </>
              ) : (
                <button onClick={handleStart} className="btn-primary flex-1 justify-center">
                  <Play className="w-4 h-4" />
                  Run All
                </button>
              )}
            </div>
          </div>

          {/* Right Panel - Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentTestCase && currentResult ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Detail Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-gray-900">{currentTestCase.title}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      currentResult.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                      currentResult.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                      currentResult.status === 'generating' ? 'bg-blue-100 text-blue-700' :
                      currentResult.status === 'running' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {currentResult.status}
                    </span>
                  </div>
                  {currentResult.playwrightScript && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Code className="w-3 h-3" />
                      {currentResult.playwrightScript.length} chars
                    </span>
                  )}
                </div>

                {/* Console Output */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
                  <div className="flex items-center gap-2 mb-3">
                    <Terminal className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase">Console Output</span>
                  </div>
                  <div className="font-mono text-xs space-y-0.5">
                    {currentResult.logs.map((log, i) => (
                      <div key={i} className="leading-relaxed">
                        {log.startsWith('[SYSTEM]') ? (
                          <span className="text-blue-400">{log}</span>
                        ) : log.startsWith('[SYSTEM ERROR]') || log.startsWith('[ERROR]') ? (
                          <span className="text-rose-400 font-semibold">{log}</span>
                        ) : log.startsWith('[BROWSER]') ? (
                          <span className="text-purple-400">{log}</span>
                        ) : (
                          <span className="text-gray-400">{log}</span>
                        )}
                      </div>
                    ))}
                    {isExecuting && currentIdx === testCases.findIndex(tc => tc.id === currentTestCase.id) && (
                      <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Executing...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Script & Session */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0 space-y-2">
                  {currentResult.playwrightScript && (
                    <details className="group">
                      <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 flex items-center gap-1">
                        <Code className="w-4 h-4" />
                        Playwright Script
                      </summary>
                      <pre className="mt-2 bg-gray-900 text-gray-300 p-3 rounded-lg text-xs overflow-x-auto max-h-40 overflow-y-auto">
                        {currentResult.playwrightScript}
                      </pre>
                    </details>
                  )}
                  {currentResult.sessionUrl && (
                    <a
                      href={currentResult.sessionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Browser Session
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select a test case to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
