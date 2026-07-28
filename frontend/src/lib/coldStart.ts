import axios from 'axios'
import { API_BASE_URL, githubLoginUrl } from './api'

// ---------------------------------------------------------------------------
// Cold-start detection for the free-tier backend. Render spins the instance
// down after ~15 min of idle traffic; the next request then hangs for up to a
// minute while the container boots. Any API call that stays unanswered past
// WATCHDOG_MS triggers a /health probe: if that probe also stalls, the backend
// is asleep and the full-screen <ColdStartOverlay /> takes over until /health
// answers. A warm-but-slow endpoint (e.g. AI generation) passes the probe and
// never shows the overlay.
// ---------------------------------------------------------------------------

const WATCHDOG_MS = 2500 // how long an API call may hang before we get suspicious
const CONFIRM_TIMEOUT_MS = 2000 // a warm backend answers /health well within this
const POLL_TIMEOUT_MS = 8000 // while booting, Render holds the connection open — keep probes long
const POLL_PAUSE_MS = 1000
const HEALTHY_TTL_MS = 45_000 // skip re-probing this long after a confirmed-healthy answer

export type ColdStartPhase = 'idle' | 'waking' | 'ready'

let phase: ColdStartPhase = 'idle'
const listeners = new Set<() => void>()

function setPhase(next: ColdStartPhase) {
  if (phase === next) return
  phase = next
  listeners.forEach(listener => listener())
}

export function subscribeColdStart(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getColdStartPhase(): ColdStartPhase {
  return phase
}

/** Called by the overlay once its "we're live" beat has played out. */
export function dismissColdStartOverlay() {
  setPhase('idle')
}

// In dev API_BASE_URL is empty and the Vite proxy forwards /health to the
// local backend (vite.config.ts); in prod this is the absolute Render origin.
const HEALTH_URL = `${API_BASE_URL}/health`

async function probeHealth(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store' })
    // Any answer below 500 means the app is up. 5xx is Render's proxy still
    // holding the fort (502/503 while the service boots or deploys).
    return res.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

let lastHealthyAt = 0
let wakePromise: Promise<void> | null = null

/**
 * Resolve once the backend answers /health. If it doesn't answer quickly the
 * overlay is shown (phase 'waking') and we keep polling until it boots.
 * Concurrent callers share one wake cycle.
 */
export function wakeBackend(): Promise<void> {
  if (Date.now() - lastHealthyAt < HEALTHY_TTL_MS) return Promise.resolve()
  if (!wakePromise) {
    wakePromise = (async () => {
      try {
        if (await probeHealth(CONFIRM_TIMEOUT_MS)) return
        setPhase('waking')
        while (!(await probeHealth(POLL_TIMEOUT_MS))) {
          await new Promise(resolve => setTimeout(resolve, POLL_PAUSE_MS))
        }
        setPhase('ready') // the overlay plays its success beat, then dismisses itself
      } finally {
        lastHealthyAt = Date.now()
        wakePromise = null
      }
    })()
  }
  return wakePromise
}

/**
 * Start the GitHub OAuth flow, waking the backend first. The login is a
 * full-page navigation to the backend, and hitting a sleeping instance
 * directly would show Render's generic "waiting for service" page.
 */
export function startGithubLogin(event?: {
  preventDefault(): void
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  button?: number
}) {
  // Let modified clicks (open in new tab/window) keep native anchor behaviour.
  if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1)) {
    return
  }
  event?.preventDefault()
  void wakeBackend().then(() => {
    window.location.assign(githubLoginUrl)
  })
}

// Watchdog: attach a timer to every axios request; if the response hasn't
// arrived by the time it fires, check whether the backend is merely slow or
// actually asleep. Registered at module scope so it runs exactly once.
const watchdogs = new WeakMap<object, ReturnType<typeof setTimeout>>()

function clearWatchdog(config: object | undefined) {
  if (!config) return
  const timer = watchdogs.get(config)
  if (timer !== undefined) {
    clearTimeout(timer)
    watchdogs.delete(config)
  }
}

axios.interceptors.request.use(config => {
  watchdogs.set(
    config,
    setTimeout(() => {
      void wakeBackend()
    }, WATCHDOG_MS)
  )
  return config
})

axios.interceptors.response.use(
  res => {
    clearWatchdog(res.config)
    return res
  },
  (err: unknown) => {
    if (axios.isAxiosError(err)) clearWatchdog(err.config)
    return Promise.reject(err)
  }
)
