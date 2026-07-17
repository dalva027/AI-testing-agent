import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileText,
  Loader2,
  Plus,
  Send,
  StopCircle,
  Wrench,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useUser } from '../App'

interface AgentTask {
  id: number
  repo_id: number
  goal: string
  status: string
  result: string | null
  verdict: string | null
  error: string | null
  credits_budget: number
  credits_spent: number
  created_at: string
}

interface AgentEvent {
  id: number
  role: string
  content: string | null
  tool_name: string | null
  tool_args: Record<string, unknown> | null
  tool_result: unknown
  created_at: string
}

interface Repo {
  id: number
  name: string
  full_name: string
  target_domain: string | null
}

// Statuses with a live loop behind them — keep polling while in one of these.
const ACTIVE = ['queued', 'running']

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-amber-100 text-amber-800',
  running: 'bg-blue-100 text-blue-800',
  awaiting_input: 'bg-purple-100 text-purple-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-gray-100 text-gray-600',
  stale: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'queued',
  running: 'running',
  awaiting_input: 'needs your input',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  stale: 'interrupted',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'} shrink-0`}>
      {status === 'running' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function ToolCard({ event }: { event: AgentEvent }) {
  // The agent's question to the user reads as chat, not as a tool invocation.
  if (event.tool_name === 'ask_user') {
    const question = String(event.tool_args?.question ?? '')
    return (
      <div className="flex items-start gap-2.5 max-w-[85%]">
        <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <CircleHelp className="w-4 h-4 text-purple-600" />
        </div>
        <div className="card px-4 py-2.5 text-sm text-gray-700 whitespace-pre-wrap border-purple-200">
          {question}
        </div>
      </div>
    )
  }

  // The final report gets a prominent card instead of a collapsed JSON blob.
  if (event.tool_name === 'report') {
    const summary = String(event.tool_args?.summary ?? '')
    const verdict = String(event.tool_args?.verdict ?? '')
    return (
      <div className="card p-4 border-emerald-200 max-w-[95%]">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-gray-900 text-sm">Final Report</span>
          {verdict && (
            <span
              className={`badge ${
                verdict === 'passed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : verdict === 'failed'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {verdict}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-700 whitespace-pre-wrap">{summary}</div>
      </div>
    )
  }

  const argsPreview = event.tool_args ? JSON.stringify(event.tool_args) : ''
  return (
    <details className="card max-w-[95%] group">
      <summary className="px-4 py-2.5 flex items-center gap-2.5 cursor-pointer select-none text-sm">
        <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
          <Wrench className="w-3.5 h-3.5 text-gray-500" />
        </div>
        <span className="font-medium text-gray-700 font-mono text-xs">{event.tool_name}</span>
        <span className="text-xs text-gray-400 truncate flex-1">
          {argsPreview.length > 80 ? argsPreview.slice(0, 80) + '…' : argsPreview}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform shrink-0" />
      </summary>
      <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-2">
        {event.tool_args && Object.keys(event.tool_args).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Arguments</p>
            <pre className="text-xs bg-gray-50 dark:bg-slate-900 rounded-lg p-2 overflow-x-auto max-h-40 overflow-y-auto">
              {JSON.stringify(event.tool_args, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Result</p>
          <pre className="text-xs bg-gray-50 dark:bg-slate-900 rounded-lg p-2 overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(event.tool_result, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  )
}

function EventRow({ event }: { event: AgentEvent }) {
  if (event.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap">
          {event.content}
        </div>
      </div>
    )
  }
  if (event.role === 'assistant') {
    if (!event.content) return null
    return (
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-primary-600" />
        </div>
        <div className="card px-4 py-2.5 text-sm text-gray-700 whitespace-pre-wrap max-w-[85%]">
          {event.content}
        </div>
      </div>
    )
  }
  if (event.role === 'tool') {
    return (
      <div className="pl-9">
        <ToolCard event={event} />
      </div>
    )
  }
  // system + progress: quiet inline notes
  return (
    <p className="text-center text-xs text-gray-400 py-1">{event.content}</p>
  )
}

export default function AgentConsole() {
  const { repoId } = useParams<{ repoId: string }>()
  const { token } = useUser()
  const [repo, setRepo] = useState<Repo | null>(null)
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [task, setTask] = useState<AgentTask | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // Bumped whenever a send/cancel may have changed the task status, so the
  // polling effect restarts even though selectedId didn't change.
  const [pollNonce, setPollNonce] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadTasks = useCallback(async () => {
    if (!token || !repoId) return
    try {
      const res = await axios.get('/api/agent/tasks', { params: { repo_id: repoId } })
      setTasks(res.data)
    } catch {
      toast.error('Failed to load agent tasks')
    }
  }, [token, repoId])

  useEffect(() => {
    if (!token || !repoId) return
    axios.get(`/api/repos/${repoId}`).then(res => setRepo(res.data)).catch(() => {})
    loadTasks()
  }, [token, repoId, loadTasks])

  // Poll the selected task. Uses an incremental cursor (after_id) so each tick
  // only transfers new events; stops once the task reaches a settled status.
  useEffect(() => {
    if (!selectedId || !token) return
    let stop = false
    let lastId = 0
    setEvents([])
    setTask(null)

    const tick = async (): Promise<string | null> => {
      const res = await axios.get(`/api/agent/tasks/${selectedId}`, {
        params: { after_id: lastId },
      })
      if (stop) return null
      setTask(res.data.task)
      setTasks(prev => prev.map(t => (t.id === res.data.task.id ? res.data.task : t)))
      const fresh: AgentEvent[] = res.data.events
      if (fresh.length) {
        lastId = fresh[fresh.length - 1].id
        setEvents(prev => [...prev, ...fresh])
      }
      return res.data.task.status
    }

    ;(async () => {
      while (!stop) {
        let status: string | null = null
        try {
          status = await tick()
        } catch {
          /* transient poll errors: retry on the next tick */
        }
        if (stop || (status && !ACTIVE.includes(status))) break
        await new Promise(r => setTimeout(r, 2500))
      }
    })()

    return () => {
      stop = true
    }
  }, [selectedId, token, pollNonce])

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [events])

  const assignTask = async () => {
    const goal = input.trim()
    if (!goal || !repoId) return
    setBusy(true)
    try {
      const res = await axios.post('/api/agent/tasks', { repo_id: Number(repoId), goal })
      setInput('')
      setTasks(prev => [res.data, ...prev])
      setSelectedId(res.data.id)
      setPollNonce(n => n + 1)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to assign task')
    } finally {
      setBusy(false)
    }
  }

  const sendMessage = async () => {
    const content = input.trim()
    if (!content || !task) return
    setBusy(true)
    try {
      await axios.post(`/api/agent/tasks/${task.id}/messages`, { content })
      setInput('')
      setPollNonce(n => n + 1)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to send message')
    } finally {
      setBusy(false)
    }
  }

  const cancelTask = async () => {
    if (!task) return
    try {
      await axios.post(`/api/agent/tasks/${task.id}/cancel`)
      setPollNonce(n => n + 1)
      toast.success('Task cancelled')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to cancel')
    }
  }

  const isActive = task ? ACTIVE.includes(task.status) : false
  const composerAction = selectedId === null ? assignTask : sendMessage
  const composerPlaceholder =
    selectedId === null
      ? 'Describe a testing task… e.g. "Run all auth tests and investigate any failures"'
      : isActive
      ? 'The agent is working — cancel to interrupt…'
      : task?.status === 'awaiting_input'
      ? 'Answer the agent…'
      : 'Send a follow-up… e.g. "now re-run just the failed ones"'

  return (
    <div className="space-y-6">
      <Link
        to={`/dashboard/${repoId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {repo ? repo.name : 'Project'}
      </Link>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center shrink-0">
          <Bot className="w-6 h-6 text-primary-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black tracking-tight text-gray-900">AI Agent</h1>
          <p className="text-sm text-gray-500 truncate">
            Assign testing tasks in plain language{repo ? ` for ${repo.full_name}` : ''} — the
            agent runs tests, investigates failures and reports back.
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedId(null)
            setTask(null)
            setEvents([])
            setInput('')
          }}
          className="btn-secondary inline-flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {repo && !repo.target_domain && (
        <div className="bg-amber-100 border border-amber-200 rounded-3xl px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This repository has no target URL — the agent cannot execute tests until one is set
          (it may ask you for it, or set it in{' '}
          <Link to={`/dashboard/${repoId}?settings=1`} className="underline font-medium">
            repository settings
          </Link>
          ).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Task list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Tasks</h3>
          </div>
          {tasks.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">
              No agent tasks yet. Describe one to get started.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
              {tasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (t.id !== selectedId) {
                      setSelectedId(t.id)
                      setPollNonce(n => n + 1)
                    }
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                    t.id === selectedId ? 'bg-primary-50/60 dark:bg-slate-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-gray-400 ml-auto shrink-0">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{t.goal}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversation */}
        <div className="card lg:col-span-2 flex flex-col h-[36rem]">
          {selectedId === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
                <Bot className="w-7 h-7 text-primary-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Assign a new task</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Tell the agent what to test. It can use existing test cases, generate new ones,
                run them in a real browser with self-healing, and dig into failures.
              </p>
            </div>
          ) : (
            <>
              {/* Task header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                {task ? (
                  <>
                    <StatusBadge status={task.status} />
                    <p className="text-sm text-gray-600 truncate flex-1">{task.goal}</p>
                    <span className="text-xs text-gray-400 shrink-0">
                      {task.credits_spent}/{task.credits_budget} credits
                    </span>
                    {isActive && (
                      <button
                        onClick={cancelTask}
                        className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}
                  </>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>

              {/* Transcript */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {events.map(ev => (
                  <EventRow key={ev.id} event={ev} />
                ))}
                {isActive && (
                  <div className="flex items-center gap-2 pl-9 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    working…
                  </div>
                )}
                {task?.status === 'failed' && task.error && (
                  <div className="flex items-center gap-2 text-xs text-rose-600 justify-center">
                    <XCircle className="w-3.5 h-3.5" />
                    {task.error}
                  </div>
                )}
                {task?.status === 'completed' && !task.result && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Task completed
                  </div>
                )}
              </div>
            </>
          )}

          {/* Composer */}
          <div className="border-t border-gray-100 p-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!busy && !isActive && input.trim()) composerAction()
                }
              }}
              placeholder={composerPlaceholder}
              disabled={isActive || busy}
              rows={2}
              className="input resize-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              onClick={composerAction}
              disabled={isActive || busy || !input.trim()}
              className="btn-primary inline-flex items-center gap-2 shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {selectedId === null ? 'Assign' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
