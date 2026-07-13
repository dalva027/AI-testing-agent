# Qira - Testing Agent - QA Platform

A multitenant SaaS application for automated software QA testing using AI, Python, FastAPI, PostgreSQL, and Playwright.

## Features

- **GitHub Integration**: Connect your GitHub repository and import code automatically
- **AI Test Case Generation**: Analyze your codebase and generate comprehensive test cases using AI
- **Playwright Browser Testing**: Execute tests in a real Chromium browser with detailed logs
- **Self-Healing Runs**: Failed runs are repaired automatically — the script is regenerated from the failure output (with memory of the last failing attempt) and retried, up to 2 extra attempts per run
- **Interactive AI Agent**: Assign testing tasks in plain language ("run the auth tests and investigate any failures"). The agent plans with tool calls, runs tests, digs into failures, asks questions when blocked, and reports back — all as a resumable background task
- **Remote Test Execution**: Optionally dispatch test runs to a GitHub Actions runner so the web service never launches a browser (fits free-tier hosting)
- **Multitenant Architecture**: Each user has isolated repositories, test cases, and agent tasks
- **Credits System**: Metered usage — 200 credits per test-case generation, 3 per run attempt, 1 per agent step; agent tasks carry a hard credit budget

## Architecture

```
┌─────────────────┐         ┌───────────────────────────┐         ┌─────────────┐
│   React Front   │────────▶│      FastAPI Backend      │────────▶│  PostgreSQL │
│  (Vite + TS)    │◀────────│  REST API + agent loop    │◀────────│    (DB)     │
└─────────────────┘         └────────────┬──────────────┘         └─────────────┘
                                         │
                          ┌──────────────┼──────────────────┐
                          ▼              ▼                  ▼
                   ┌────────────┐ ┌─────────────┐ ┌──────────────────────┐
                   │ GitHub API │ │ AI (Gemini, │ │ Playwright runner    │
                   │  (OAuth,   │ │  OpenAI     │ │ local subprocess or  │
                   │   repos)   │ │  fallback)  │ │ GitHub Actions CI    │
                   └────────────┘ └─────────────┘ └──────────────────────┘
```

- **Test run engine** (`backend/app/services/run_service.py`): generate script → execute → self-heal loop, shared by the REST API and the agent.
- **AI agent** (`backend/app/services/agent_service.py`): a background tool-calling loop. Every step is persisted as an event row, so a task survives restarts and can be resumed by sending a message. Tools include listing/generating test cases, running tests, reading repo files, run history, and repo settings.
- **Executors** (`backend/app/services/playwright_service.py` / `actions_runner.py`): identical result contract whether tests run in a local subprocess (`TEST_RUNNER=local`) or on a dispatched GitHub Actions workflow (`TEST_RUNNER=github-actions`). Generated scripts are untrusted and always run isolated, time-boxed, and without secrets.

## Workflow

1. **Connect GitHub**: OAuth flow links your GitHub account
2. **Add Repository**: Browse and select repos from your GitHub account
3. **Generate Test Cases**: AI analyzes your code and creates test cases
4. **Run Tests**: Execute in a real browser with detailed logging and automatic self-heal on failure
5. **View Results**: Pass/fail tracking with per-attempt run history
6. **Or delegate it**: Create an agent task with a natural-language goal and let the agent do steps 3–5, then read its report

## API Overview

| Area | Endpoints |
|---|---|
| Auth | `GET /api/auth/github/login`, `GET /api/auth/github/callback`, `GET /api/auth/me`, `POST /api/auth/refresh` |
| Repositories | `GET/POST/PATCH/DELETE /api/repos`, `GET /api/repos/github` |
| Test cases | `POST /api/test-cases/generate`, `GET /api/test-cases/repo/{id}`, `GET /api/test-cases/stats/{id}`, `PATCH/DELETE /api/test-cases/{id}` |
| Execution | `POST /api/test-cases/run`, `GET /api/test-cases/run/runs/{id}` |
| Agent | `POST /api/agent/tasks`, `GET /api/agent/tasks`, `GET /api/agent/tasks/{id}?after_id=`, `POST /api/agent/tasks/{id}/messages`, `POST /api/agent/tasks/{id}/cancel` |

Agent task statuses: `queued → running → awaiting_input / completed / failed / cancelled / stale` (stale = interrupted by a restart; send a message to resume).

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (async; `sslmode` params are normalized for asyncpg) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `GITHUB_REDIRECT_URI` | OAuth callback URL (`/api/auth/github/callback`) |
| `GEMINI_API_KEY` | Google Gemini API key (primary AI provider) |
| `OPENAI_API_KEY` | OpenAI API key (optional fallback provider) |
| `GEMINI_BASE_URL` | OpenAI-compatible endpoint for Gemini models |
| `TEST_RUNNER` | `local` (default) or `github-actions` |
| `GH_ACTIONS_TOKEN` | Fine-grained PAT with Actions read+write (remote runner only) |
| `GH_ACTIONS_REPO` | `owner/repo` hosting `.github/workflows/run-playwright.yml` |
| `GH_ACTIONS_WORKFLOW` | Workflow file name (default `run-playwright.yml`) |
| `GH_ACTIONS_REF` | Git ref to dispatch (default `main`) |
| `GH_ACTIONS_RUN_TIMEOUT` | Wall-clock budget per CI run in seconds (default 900) |
| `PLAYWRIGHT_BROWSERS_PATH` | Browser install path for the local runner (optional) |
| `SECRET_KEY` | JWT secret key |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy (async), AsyncPG
- **Frontend**: React 19, TypeScript, Vite
- **Database**: PostgreSQL
- **Testing**: Playwright (`@playwright/test`, Chromium), locally or on GitHub Actions
- **AI**: Google Gemini (`gemini-2.5-flash` via OpenAI-compatible endpoint) with OpenAI (`gpt-4o-mini`) fallback; tool calling for the agent loop
- **Auth**: GitHub OAuth + app-issued JWTs

## License

MIT
