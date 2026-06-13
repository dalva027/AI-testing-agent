import { Routes, Route } from 'react-router-dom'
import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import axios from 'axios'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Workspace from './pages/Workspace'
import TestResults from './pages/TestResults'

interface AppUser {
  id: number
  name: string
  email: string
  credits: number
}

interface UserContextType {
  user: AppUser | null
  setUser: (u: AppUser | null) => void
  token: string | null
  setToken: (t: string | null) => void
  logout: () => void
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  token: null,
  setToken: () => {},
  logout: () => {},
})

const useUser = () => useContext(UserContext)

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
    <UserContext.Provider value={{ user, setUser, token, setToken, logout }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="results" element={<TestResults />} />
        </Route>
      </Routes>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </UserContext.Provider>
  )
}

export { UserContext, useUser }
export default App
