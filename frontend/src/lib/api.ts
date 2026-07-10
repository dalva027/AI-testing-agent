import axios from 'axios'

// Backend origin for API calls. Empty in dev, where Vite's proxy
// (vite.config.ts) forwards /api to the local backend — that proxy only exists
// on the dev server, so production builds must call the backend's absolute URL.
// Set VITE_API_URL at build time, e.g. https://qira-backend.onrender.com
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

if (API_BASE_URL) {
  axios.defaults.baseURL = API_BASE_URL
}

// GitHub OAuth entry point. This is a full-page navigation (<a href>), not an
// axios request, so it needs the absolute backend origin itself.
export const githubLoginUrl = `${API_BASE_URL}/api/auth/github/login`
