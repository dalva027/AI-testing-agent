import { Outlet, Link, useLocation } from 'react-router-dom'
import { Bug, LayoutDashboard, FolderGit2, BarChart3, LogOut } from 'lucide-react'
import { useUser } from '../App'

export default function Layout() {
  const location = useLocation()
  const { user, logout } = useUser()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/workspace', label: 'Workspace', icon: FolderGit2 },
    { path: '/results', label: 'Test Results', icon: BarChart3 },
  ]

  const isActive = (path: string) => location.pathname === path

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Bug className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">Testing<span className="text-primary-600">Agent</span></span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-xs font-medium text-amber-700">Credits:</span>
                  <span className="text-sm font-bold text-amber-800">{user.credits}</span>
                </div>
              )}
              {user ? (
                <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              ) : (
                <Link to="/workspace" className="btn-primary text-sm">
                  Connect GitHub
                </Link>
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
