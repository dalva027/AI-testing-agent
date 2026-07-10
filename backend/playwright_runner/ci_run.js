// CI entrypoint used by .github/workflows/run-playwright.yml.
//
// Runs the generated spec exactly like the local executor does
// (app/services/playwright_service.py) and serializes the outcome to
// result.json, which the workflow uploads as an artifact for the backend to
// collect. Exits non-zero on failure so the workflow run shows red, but the
// backend only trusts result.json.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const timeoutMs = parseInt(process.env.QIRA_TIMEOUT_MS || '60000', 10);
// Playwright's own per-test timeout must fire before the process-level kill,
// so the failure surfaces as a readable test error instead of a hard kill.
const start = Date.now();

const proc = spawnSync(
  'npx',
  ['playwright', 'test', 'tests/generated.spec.js', '--reporter=line'],
  {
    cwd: __dirname,
    encoding: 'utf-8',
    timeout: timeoutMs + 30_000,
    env: process.env,
    // npx is npx.cmd on Windows and needs a shell there (CI runs Linux; this
    // just keeps `node ci_run.js` testable in local dev). Args are fixed
    // literals, so the shell sees nothing untrusted.
    shell: process.platform === 'win32',
  }
);

const durationMs = Date.now() - start;
const timedOut = !!(proc.error && proc.error.code === 'ETIMEDOUT');

const lines = ((proc.stdout || '') + (proc.stderr || ''))
  .split('\n')
  .filter((l) => l.trim());

// The backend's self-heal prompt only keeps the tail, so trimming here just
// bounds the artifact size.
const MAX_LINES = 400;
const logs =
  lines.length > MAX_LINES
    ? ['...(earlier output trimmed)...', ...lines.slice(-MAX_LINES)]
    : lines;

const result = {
  success: !timedOut && proc.status === 0,
  exit_code: proc.status,
  timed_out: timedOut,
  duration_ms: durationMs,
  logs,
};

fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result, null, 2));
console.log(`[ci_run] success=${result.success} exit_code=${proc.status} timed_out=${timedOut}`);
process.exit(result.success ? 0 : 1);
