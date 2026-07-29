import { Outlet, Link, useLocation } from 'react-router-dom'
import { Bug, LayoutDashboard, Bot, BarChart3, LogOut, Sun, Moon } from 'lucide-react'
import { useUser } from '../App'
import { githubLoginUrl } from '../lib/api'
import { startGithubLogin } from '../lib/coldStart'

export default function Layout() {
  const location = useLocation()
  const { user, logout, theme, toggleTheme } = useUser()

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/agent', label: 'AI Agent', icon: Bot },
    { path: '/results', label: 'Test Results', icon: BarChart3 },
  ]

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname.startsWith('/dashboard')
      : location.pathname === path

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5">
              {/* Ink tile + lime glyph: the brand's polarity-flip moment. */}
              <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center">
                <Bug className="w-5 h-5 text-primary-500" />
              </div>
              <span className="text-lg font-extrabold tracking-tight text-gray-900"><span className="text-primary-600">Qira</span> – Testing Agent</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${
                    isActive(item.path)
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle theme"
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              {user && (
                // Below one generation's worth (200 credits) the pill turns red as a
                // low-balance cue; otherwise it stays amber.
                <div
                  title={user.credits < 200 ? 'Low balance — generating test cases costs 200 credits' : undefined}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                    user.credits < 200 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <span className={`text-xs font-medium ${user.credits < 200 ? 'text-rose-700' : 'text-amber-700'}`}>Credits:</span>
                  <span className={`text-sm font-bold ${user.credits < 200 ? 'text-rose-800' : 'text-amber-800'}`}>{user.credits}</span>
                </div>
              )}
              {user ? (
                <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              ) : (
                // Start the OAuth flow directly (full-page navigation to the
                // backend) instead of routing to /dashboard first.
                <a href={githubLoginUrl} onClick={startGithubLogin} className="btn-primary text-sm">
                  Connect GitHub
                </a>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 z-50">
        <div className="flex items-center justify-around py-2">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive(item.path)
                  ? 'text-primary-600'
                  : 'text-gray-500'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
