import { Link } from 'react-router-dom'
import {
  Github,
  Sparkles,
  ArrowRight,
  Terminal,
  CheckCircle2,
  XCircle,
  Bug,
  Code2,
  Globe,
  Zap,
  GitBranch,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { useUser } from '../App'
import { githubLoginUrl } from '../lib/api'

const runnerLines: { glyph: '✓' | '✗'; type: string; name: string; ms: string; ok: boolean }[] = [
  { glyph: '✓', type: 'auth', name: 'login with valid credentials', ms: '412ms', ok: true },
  { glyph: '✓', type: 'ui', name: 'navbar renders all links', ms: '88ms', ok: true },
  { glyph: '✓', type: 'form', name: 'submit contact form', ms: '301ms', ok: true },
  { glyph: '✗', type: 'edge', name: 'rejects empty payload', ms: '231ms', ok: false },
  { glyph: '✓', type: 'api', name: 'GET /api/users → 200', ms: '54ms', ok: true },
]

export default function Landing() {
  const { token } = useUser()

  return (
    <div className="space-y-16">
      {/* ===== Hero (ink band, lime accents — the brand's dark hero) ===== */}
      <section className="static-dark relative overflow-hidden rounded-3xl bg-gray-950 border border-white/10 text-white">
        {/* layered background */}
        <div className="absolute inset-0 bg-grid-dark opacity-60" />
        <div className="absolute -top-24 -left-16 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-10 w-[28rem] h-[28rem] bg-blue-400/15 rounded-full blur-3xl" />

        <div className="relative z-10 grid lg:grid-cols-2 gap-10 items-center p-8 md:p-12 lg:p-16">
          {/* Left: copy */}
          <div className="animate-rise">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/15 rounded-full text-sm font-medium mb-5">
              <Zap className="w-4 h-4 text-primary-500" />
              AI-Powered QA Automation
            </div>
            <h1 className="text-4xl md:text-5xl xl:text-6xl font-black leading-[1.02] tracking-tight">
              Find the bugs
              <br />
              <span className="bg-gradient-to-r from-primary-500 via-primary-200 to-primary-500 bg-clip-text text-transparent animate-gradient-pan">
                before your users do.
              </span>
            </h1>
            <p className="text-lg text-slate-300 mt-5 max-w-xl leading-relaxed">
              Connect a GitHub repo and let AI read your code, write Playwright tests, and run them
              in a real Chromium browser — with full console output and pass/fail tracking.
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              {token ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 bg-primary-500 text-gray-900 font-semibold px-6 py-3 rounded-full hover:bg-primary-200 transition-colors"
                >
                  <Terminal className="w-5 h-5" />
                  Open Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <a
                  href={githubLoginUrl}
                  className="inline-flex items-center gap-2 bg-primary-500 text-gray-900 font-semibold px-6 py-3 rounded-full hover:bg-primary-200 transition-colors"
                >
                  <Github className="w-5 h-5" />
                  Connect GitHub
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-6 py-3 rounded-full hover:bg-white/20 transition-colors border border-white/15"
              >
                <GitBranch className="w-5 h-5" />
                Explore Projects
              </Link>
            </div>

            {/* trust chips */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-8 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5"><Globe className="w-4 h-4 text-primary-400" /> Real Chromium</span>
              <span className="inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary-300" /> AI-generated</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Sandboxed runs</span>
              <span className="inline-flex items-center gap-1.5"><Github className="w-4 h-4 text-slate-300" /> GitHub native</span>
            </div>
          </div>

          {/* Right: terminal mock */}
          <div className="relative animate-rise" style={{ animationDelay: '120ms' }}>
            {/* floating result chips */}
            <div className="hidden sm:flex absolute -top-4 -left-4 z-20 animate-floaty items-center gap-2 bg-slate-900/90 border border-emerald-500/30 rounded-xl px-3 py-2 shadow-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">auth · passed</span>
            </div>
            <div
              className="hidden sm:flex absolute -bottom-5 -right-3 z-20 animate-floaty items-center gap-2 bg-slate-900/90 border border-rose-500/30 rounded-xl px-3 py-2 shadow-xl"
              style={{ animationDelay: '1.2s' }}
            >
              <XCircle className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-medium text-rose-300">edge-case · caught</span>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur shadow-2xl">
              {/* title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
                <span className="w-3 h-3 rounded-full bg-rose-400/80" />
                <span className="w-3 h-3 rounded-full bg-amber-400/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
                <div className="flex items-center gap-1.5 ml-3 text-xs text-slate-400">
                  <Terminal className="w-3.5 h-3.5" />
                  qa-agent — chromium
                </div>
              </div>
              {/* body */}
              <div className="relative p-5 font-mono text-[13px] leading-relaxed">
                {/* scanline sweep */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary-400/10 to-transparent animate-scanline" />
                <div className="text-slate-500">
                  <span className="text-primary-400">$</span> qa-agent run --all
                </div>
                <div className="mt-2 space-y-1.5">
                  {runnerLines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={l.ok ? 'text-emerald-400' : 'text-rose-400'}>{l.glyph}</span>
                      <span className="text-slate-500">{l.type}</span>
                      <span className="text-slate-300">{l.name}</span>
                      <span className="ml-auto text-slate-600">{l.ms}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-3 text-xs">
                  <span className="text-emerald-400">4 passed</span>
                  <span className="text-rose-400">1 failed</span>
                  <span className="text-slate-500">· 1.08s</span>
                </div>
                <div className="mt-2 flex items-center text-slate-500">
                  <span className="text-primary-400">$</span>
                  <span className="ml-2 inline-block w-2 h-4 bg-primary-500 animate-blink" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section>
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900">From repo to results in three steps</h2>
          <p className="text-gray-500 mt-2">No test-writing. No flaky setup. Just connect and run.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: GitBranch,
              title: 'Connect your repo',
              desc: 'Link a public GitHub repository and we analyze its routes, components, and structure automatically.',
              tile: 'bg-gray-900',
              glyph: 'text-primary-500',
            },
            {
              icon: Sparkles,
              title: 'AI generates tests',
              desc: 'The engine reads your source and writes Playwright test cases across UI, API, auth, and edge cases.',
              tile: 'bg-primary-500',
              glyph: 'text-gray-900',
            },
            {
              icon: Play,
              title: 'Run in a real browser',
              desc: 'Each test executes in a sandboxed Chromium runner with detailed console output and pass/fail status.',
              tile: 'bg-primary-100',
              glyph: 'text-primary-700',
            },
          ].map((step, i) => (
            <div key={i} className="card card-hover p-6 relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-gray-900 text-sm font-bold shadow-md">
                {i + 1}
              </div>
              <div className={`w-12 h-12 ${step.tile} rounded-2xl flex items-center justify-center mb-4`}>
                <step.icon className={`w-6 h-6 ${step.glyph}`} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-gray-600 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Features ===== */}
      <section>
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900">Built for debugging real software</h2>
          <p className="text-gray-500 mt-2">Everything you need to catch regressions early.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Code2, label: 'AI Test Generation', desc: 'Smart analysis of your codebase' },
            { icon: Globe, label: 'Real Browser Testing', desc: 'Chromium-powered execution' },
            { icon: Terminal, label: 'Detailed Logs', desc: 'Full console & browser output' },
            { icon: ShieldCheck, label: 'Sandboxed Runs', desc: 'Isolated, time-boxed execution' },
          ].map((feature, i) => (
            <div key={i} className="card card-hover p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
                <feature.icon className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 text-sm">{feature.label}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA band (polarity-flipped: ink surface, lime voice) ===== */}
      <section className="static-dark relative overflow-hidden rounded-3xl bg-gray-950 border border-white/10 text-white p-8 md:p-12">
        <div className="absolute inset-0 bg-grid-dark opacity-40" />
        <div className="absolute -right-8 -bottom-8 text-primary-500 opacity-20">
          <Bug className="w-48 h-48" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-primary-500">Ship with confidence.</h2>
            <p className="text-white/80 mt-2 max-w-xl">
              Connect a repository and watch AI turn your code into a passing (or failing) test suite.
            </p>
          </div>
          {token ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 bg-primary-500 text-gray-900 font-semibold px-6 py-3 rounded-full hover:bg-primary-200 transition-colors shrink-0"
            >
              <CheckCircle2 className="w-5 h-5" />
              Go to Dashboard
            </Link>
          ) : (
            <a
              href={githubLoginUrl}
              className="inline-flex items-center gap-2 bg-primary-500 text-gray-900 font-semibold px-6 py-3 rounded-full hover:bg-primary-200 transition-colors shrink-0"
            >
              <Github className="w-5 h-5" />
              Connect GitHub
            </a>
          )}
        </div>
      </section>
    </div>
  )
}
