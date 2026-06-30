# Qira - Testing Agent - Multitenant QA Platform

A multitenant SaaS application for automated software QA testing using AI, Python, FastAPI, PostgreSQL, and Playwright.

## Features

- **GitHub Integration**: Connect your GitHub repository and import code automatically
- **AI Test Case Generation**: Analyze your codebase and generate comprehensive test cases using AI
- **Playwright Browser Testing**: Execute tests in a real Chromium browser with detailed logs
- **Multitenant Architecture**: Each user has isolated repositories and test cases
- **Real-time Results**: Pass/fail tracking with console output and screenshots
- **Beautiful UI**: Modern React + Tailwind dashboard

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   React Front   │────────▶│   FastAPI Backend │────────▶│  PostgreSQL  │
│  (Vite + TS)    │◀────────│   (REST API)     │◀────────│   (DB)       │
└─────────────────┘         └────────┬─────────┘         └─────────────┘
                                     │
                              ┌──────▼───────┐
                              │   GitHub API  │
                              │   AI (Gemini) │
                              │ Playwright    │
                              └───────────────┘
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- GitHub account (for OAuth)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1      # Windows (PowerShell)
source .venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium

# Install the isolated test runner (executes AI-generated specs out-of-process)
cd playwright_runner
npm install
npx playwright install chromium   # safe to skip if already installed above
cd ..

# Set up environment
copy .env.example .env   # Windows
cp .env.example .env     # macOS/Linux

# Edit .env and add your:
# - DATABASE_URL
# - GITHUB_CLIENT_ID
# - GITHUB_CLIENT_SECRET
# - GITHUB_REDIRECT_URI (must match your GitHub OAuth app callback)
# - GEMINI_API_KEY (or OPENAI_API_KEY)

# Run the server (tables are auto-created on startup)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **GitHub OAuth app setup:** set the Authorization callback URL to
> `http://localhost:8000/api/auth/github/callback` (matching `GITHUB_REDIRECT_URI`).

> **Security note:** generated Playwright scripts run in an isolated Node subprocess
> (`backend/playwright_runner/`) with a hard timeout — not via in-process `exec()`.
> Authentication uses a short-lived app JWT (Bearer token); the GitHub access token is
> stored server-side and never sent to the browser.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run dev server (API proxied to backend)
npm run dev
```

Visit `http://localhost:5173` to use the app.

## API Documentation

Interactive API docs at `http://localhost:8000/docs`

## Workflow

1. **Connect GitHub**: OAuth flow links your GitHub account
2. **Add Repository**: Browse and select repos from your GitHub account
3. **Generate Test Cases**: AI analyzes your code and creates test cases
4. **Run Tests**: Execute in a real browser with detailed logging
5. **View Results**: Pass/fail tracking with console output

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (async) |
| `SYNC_DATABASE_URL` | PostgreSQL connection string (sync for Alembic) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `GEMINI_API_KEY` | Google Gemini API key for AI |
| `SECRET_KEY` | JWT secret key |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy, AsyncPG
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Database**: PostgreSQL
- **Testing**: Playwright (Chromium)
- **AI**: Google Gemini API
- **Auth**: GitHub OAuth

## License

MIT
