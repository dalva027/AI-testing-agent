/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for production builds (e.g. https://qira-backend.onrender.com). Unset in dev — the Vite proxy handles /api. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
