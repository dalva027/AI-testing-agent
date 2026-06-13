import { Link } from 'react-router-dom'
import {
  Github,
  Sparkles,
  Code2,
  Play,
  BarChart3,
  CheckCircle2,
  Terminal,
  Globe,
  Zap,
  ArrowRight,
} from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-purple-600 to-primary-700 p-8 md:p-12 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-300 rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            AI-Powered QA Automation
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            Automate your software testing with AI
          </h1>
          <p className="text-lg text-white/80 mb-8 leading-relaxed">
            Connect your GitHub repo, let AI analyze your code and generate test cases,
            then run them in a real browser — all from one platform.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/workspace" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors">
              <Github className="w-5 h-5" />
              Connect GitHub
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/results" className="inline-flex items-center gap-2 bg-white/20 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/30 transition-colors border border-white/20">
              <BarChart3 className="w-5 h-5" />
              View Results
            </Link>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Github,
              title: 'Connect Your Repo',
              desc: 'Link your GitHub repository and we\'ll analyze the code structure, routes, and components automatically.',
              color: 'from-gray-700 to-gray-900',
            },
            {
              icon: Sparkles,
              title: 'AI Generates Tests',
              desc: 'Our AI engine reads your source files and generates comprehensive test cases covering UI, API, auth, and edge cases.',
              color: 'from-primary-500 to-purple-600',
            },
            {
              icon: Play,
              title: 'Run in Real Browser',
              desc: 'Test cases execute in a real cloud browser with detailed logs, screenshots, and pass/fail results.',
              color: 'from-emerald-500 to-teal-600',
            },
          ].map((step, i) => (
            <div key={i} className="card card-hover p-6 relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {i + 1}
              </div>
              <div className={`w-12 h-12 bg-gradient-to-br ${step.color} rounded-xl flex items-center justify-center mb-4`}>
                <step.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-gray-600 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Code2, label: 'AI Test Generation', desc: 'Smart analysis of your codebase' },
            { icon: Globe, label: 'Real Browser Testing', desc: 'Chromium-powered execution' },
            { icon: Terminal, label: 'Detailed Logs', desc: 'Console output & screenshots' },
            { icon: CheckCircle2, label: 'Pass/Fail Tracking', desc: 'Track test history over time' },
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
      </div>
    </div>
  )
}
