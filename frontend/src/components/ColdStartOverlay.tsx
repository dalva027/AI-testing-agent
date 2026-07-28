import { useEffect, useState, useSyncExternalStore } from 'react'
import { Bug, CheckCircle2, RefreshCw } from 'lucide-react'
import {
  dismissColdStartOverlay,
  getColdStartPhase,
  subscribeColdStart,
} from '../lib/coldStart'

const STATUS_LINES = [
  'Knocking on the server door…',
  'Warming up the test runners…',
  'Feeding the bug catcher…',
  'Rehydrating the database…',
  'Untangling the CI pipelines…',
  'Polishing the assertions…',
  'Herding a few stray selectors…',
  'Recounting flaky tests (still zero)…',
]

function pokeCaption(pokes: number): string | null {
  if (pokes === 0) return null
  if (pokes === 1) return 'Hey! Qira felt that.'
  if (pokes < 5) return 'Poking the bot boosts morale by 3%.'
  if (pokes < 10) return 'Okay, okay — it’s booting as fast as it can!'
  if (pokes < 20) return `${pokes} pokes and counting. Impressive dedication.`
  return 'Achievement unlocked: Professional Bot Poker 🏆'
}

/**
 * Friendly full-screen loading screen shown while the free-tier backend wakes
 * up from a cold start (see lib/coldStart.ts for the detection logic).
 */
export default function ColdStartOverlay() {
  const phase = useSyncExternalStore(subscribeColdStart, getColdStartPhase)
  if (phase === 'idle') return null
  return <WakeScreen ready={phase === 'ready'} />
}

function WakeScreen({ ready }: { ready: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [pokes, setPokes] = useState(0)

  // One heartbeat drives the progress bar, rotating copy and long-wait hints.
  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Once the backend answers, fill the bar, celebrate briefly, then get out
  // of the way — pages keep their own spinners while data streams in.
  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(dismissColdStartOverlay, 1200)
    return () => window.clearTimeout(timer)
  }, [ready])

  // Time-based progress: fast at first, easing toward 95% until we're
  // actually connected (a typical cold boot takes ~30–60 s).
  const pct = ready ? 100 : Math.min(95, Math.round(100 * (1 - Math.exp(-elapsedMs / 22000))))
  const seconds = Math.round(elapsedMs / 1000)
  const lineIndex = Math.floor(elapsedMs / 3200) % STATUS_LINES.length
  const statusLine = ready ? 'Connected — loading your data…' : STATUS_LINES[lineIndex]
  const caption = pokeCaption(pokes)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 dark:hidden" />
      <div className="bg-grid-dark pointer-events-none absolute inset-0 hidden dark:block" />

      <span role="status" className="sr-only">
        {ready ? 'Server connected.' : 'Waking up the server, please wait.'}
      </span>

      <div className="card animate-rise relative w-full max-w-md p-8 text-center shadow-lg">
        {/* Pokeable mascot — the interactive bit while folks wait. */}
        <button
          type="button"
          onClick={() => setPokes(p => p + 1)}
          aria-label="Poke the bot while you wait"
          title="Poke the bot"
          className="group mx-auto mb-6 block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          <span className="animate-floaty block">
            <span
              key={pokes}
              className={`relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-900 transition-transform group-active:scale-90 ${
                pokes > 0 ? 'animate-wiggle' : ''
              }`}
            >
              {ready ? (
                <CheckCircle2 className="h-10 w-10 text-primary-500" />
              ) : (
                <Bug className="h-10 w-10 text-primary-500" />
              )}
              {!ready && (
                <span
                  aria-hidden
                  className="absolute -right-5 -top-4 select-none text-base font-black text-gray-400"
                >
                  <span className="animate-blink">z</span>
                  <span className="animate-blink" style={{ animationDelay: '0.35s' }}>
                    z
                  </span>
                  <span className="animate-blink" style={{ animationDelay: '0.7s' }}>
                    z
                  </span>
                </span>
              )}
            </span>
          </span>
        </button>

        <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-900">
          {ready ? 'We’re live!' : 'Waking up the server…'}
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Our free-tier server takes a nap when nobody’s around, and your visit just woke it up.
          This usually takes under a minute — everything continues automatically.
        </p>

        <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs font-medium text-gray-500">
          <span key={statusLine} className="animate-rise">
            {statusLine}
          </span>
          <span className="tabular-nums">{seconds}s</span>
        </div>

        <div className="mt-4 min-h-5 text-xs font-semibold text-primary-600">
          {!ready && caption}
        </div>

        {!ready && elapsedMs > 45_000 && (
          <p className="mt-2 text-xs text-gray-500">
            First boot of the day can be extra sleepy — thanks for hanging in there.
          </p>
        )}
        {!ready && elapsedMs > 110_000 && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh the page
          </button>
        )}
      </div>
    </div>
  )
}
