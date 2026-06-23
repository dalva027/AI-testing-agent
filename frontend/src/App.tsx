import { Routes, Route } from 'react-router-dom'
import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import axios from 'axios'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ProjectDashboard from './pages/ProjectDashboard'
import Workspace from './pages/Workspace'
import TestResults from './pages/TestResults'

interface AppUser {
  id: number
  name: string
  email: string
  credits: number
}

type Theme = 'light' | 'dark'

interface UserContextType {
  user: AppUser | null
  setUser: (u: AppUser | null) => void
  token: string | null
  setToken: (t: string | null) => void
  logout: () => void
  theme: Theme
  toggleTheme: () => void
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  token: null,
  setToken: () => {},
  logout: () => {},
  theme: 'light',
  toggleTheme: () => {},
})

const useUser = () => useContext(UserContext)
const useTheme = () => {
  const { theme, toggleTheme } = useContext(UserContext)
  return { theme, toggleTheme }
}

function applyAuthHeader(token: string | null) {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete axios.defaults.headers.common['Authorization']
  }
}

function App() {
  const [user, setUserState] = useState<AppUser | null>(null)
  const [token, setTokenState] = useState<string | null>(null)
  // Initialise from the class the anti-FOUC script already set on <html>.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
  )

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      localStorage.setItem('qa-theme', next)
      return next
    })
  }, [])

  const setToken = useCallback((t: string | null) => {
    setTokenState(t)
    applyAuthHeader(t)
    if (t) localStorage.setItem('qa-token', t)
    else localStorage.removeItem('qa-token')
  }, [])

  const setUser = useCallback((u: AppUser | null) => {
    setUserState(u)
    if (u) localStorage.setItem('qa-user', JSON.stringify(u))
    else localStorage.removeItem('qa-user')
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
  }, [setUser, setToken])

  // Bootstrap auth: read the app token from the OAuth redirect fragment or from
  // localStorage, then load the current user from the API.
  useEffect(() => {
    let initialToken: string | null = null
    const hash = window.location.hash
    if (hash.startsWith('#token=')) {
      initialToken = decodeURIComponent(hash.slice('#token='.length))
      // Strip the token out of the visible URL.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else {
      initialToken = localStorage.getItem('qa-token')
    }

    if (initialToken) {
      setToken(initialToken)
      applyAuthHeader(initialToken)
      axios
        .get('/api/auth/me')
        .then(res => setUser(res.data))
        .catch(() => {
          setUser(null)
          setToken(null)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Globally handle expired/invalid tokens.
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          logout()
        }
        return Promise.reject(err)
      }
    )
    return () => axios.interceptors.response.eject(interceptor)
  }, [logout])

  return (
    <UserContext.Provider value={{ user, setUser, token, setToken, logout, theme, toggleTheme }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="dashboard/:repoId" element={<ProjectDashboard />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="results" element={<TestResults />} />
        </Route>
      </Routes>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </UserContext.Provider>
  )
}

export { UserContext, useUser, useTheme }
export default App
