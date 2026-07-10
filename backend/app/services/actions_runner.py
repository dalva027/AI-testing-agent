"""Execute generated Playwright specs on GitHub Actions instead of a local subprocess.

Free-tier web instances (512 MB on Render/Koyeb) OOM when Chromium launches inside
the service container. With TEST_RUNNER=github-actions the backend instead
dispatches `.github/workflows/run-playwright.yml` in GH_ACTIONS_REPO with the
generated script, waits for the run to finish, and reads the outcome from the
`result-<dispatch_id>` artifact the workflow uploads.

The returned dict has the same shape as run_playwright_test's, so the run loop
(including self-heal and failure memory) cannot tell the executors apart.
"""

import asyncio
import base64
import io
import json
import time
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import get_settings

GITHUB_API = "https://api.github.com"

# The dispatch API returns 204 without a run id, so the run is found by matching
# run-name ("qira-test-run <dispatch_id>") among recent workflow_dispatch runs.
RUN_APPEAR_TIMEOUT = 120  # seconds to wait for the dispatched run to be listed
POLL_INTERVAL = 5


def _headers(settings) -> dict:
    return {
        "Authorization": f"Bearer {settings.GH_ACTIONS_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _find_dispatched_run(
    client: httpx.AsyncClient, repo: str, workflow: str, run_name: str, since: str
) -> dict | None:
    resp = await client.get(
        f"{GITHUB_API}/repos/{repo}/actions/workflows/{workflow}/runs",
        params={"event": "workflow_dispatch", "created": f">{since}", "per_page": 100},
    )
    if resp.status_code != 200:
        return None
    for run in resp.json().get("workflow_runs", []):
        # The rendered run-name lands in display_title; older API behavior kept
        # it in name. Match either.
        if run_name in (run.get("display_title"), run.get("name")):
            return run
    return None


async def _download_result_artifact(
    client: httpx.AsyncClient, repo: str, run_id: int, artifact_name: str
) -> dict | None:
    """Fetch and parse result.json from the run's result artifact, or None."""
    resp = await client.get(f"{GITHUB_API}/repos/{repo}/actions/runs/{run_id}/artifacts")
    if resp.status_code != 200:
        return None
    artifact = next(
        (a for a in resp.json().get("artifacts", []) if a["name"] == artifact_name),
        None,
    )
    if artifact is None:
        return None
    # The download URL 302s to signed blob storage; httpx drops the Authorization
    # header on the cross-host redirect, which is what the storage endpoint wants.
    resp = await client.get(artifact["archive_download_url"])
    if resp.status_code != 200:
        return None
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        for name in zf.namelist():
            if name.endswith("result.json"):
                return json.loads(zf.read(name).decode("utf-8"))
    return None


async def run_playwright_test_on_actions(
    playwright_script: str,
    base_url: str,
    timeout: int = 60000,
) -> dict:
    """Dispatch the CI workflow for one generated spec and await its result.

    Same contract as playwright_service.run_playwright_test: a dict with logs,
    duration_ms, screenshot, success and error.
    """
    settings = get_settings()
    logs: list[str] = []
    start_time = time.time()

    def log(msg: str):
        logs.append(msg)

    def result(success: bool, error: str | None = None) -> dict:
        duration = (time.time() - start_time) * 1000
        log(f"[SYSTEM] Test completed in {duration:.0f}ms")
        return {
            "logs": logs,
            "duration_ms": duration,
            "screenshot": None,
            "success": success,
            "error": error,
        }

    repo = settings.GH_ACTIONS_REPO
    workflow = settings.GH_ACTIONS_WORKFLOW
    if not settings.GH_ACTIONS_TOKEN or not repo:
        log(
            "[SYSTEM ERROR] TEST_RUNNER=github-actions requires GH_ACTIONS_TOKEN and "
            "GH_ACTIONS_REPO (owner/repo) to be set."
        )
        return result(False, error="GitHub Actions runner not configured")

    script_b64 = base64.b64encode(playwright_script.encode("utf-8")).decode("ascii")
    if len(script_b64) > 60000:
        # workflow_dispatch caps all inputs at 64 KB combined.
        log(
            f"[SYSTEM ERROR] Generated script is too large to dispatch "
            f"({len(script_b64)} chars base64-encoded; limit ~60000)."
        )
        return result(False, error="script too large for workflow dispatch")

    dispatch_id = uuid.uuid4().hex
    run_name = f"qira-test-run {dispatch_id}"
    # Small skew allowance so a slow clock doesn't filter out our own run.
    since = (datetime.now(timezone.utc) - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

    log(f"[SYSTEM] Starting Playwright test execution against {base_url}")
    log(f"[SYSTEM] Script length: {len(playwright_script)} characters")
    log(f"[SYSTEM] Dispatching CI run {dispatch_id} to {repo}/{workflow}")

    async with httpx.AsyncClient(
        headers=_headers(settings), timeout=30, follow_redirects=True
    ) as client:
        resp = await client.post(
            f"{GITHUB_API}/repos/{repo}/actions/workflows/{workflow}/dispatches",
            json={
                "ref": settings.GH_ACTIONS_REF,
                "inputs": {
                    "dispatch_id": dispatch_id,
                    "script_b64": script_b64,
                    "base_url": base_url,
                    "timeout_ms": str(timeout),
                },
            },
        )
        if resp.status_code != 204:
            detail = resp.text[:500]
            log(f"[SYSTEM ERROR] Workflow dispatch failed ({resp.status_code}): {detail}")
            if resp.status_code == 404:
                log(
                    "[SYSTEM ERROR] Check that the repo/workflow exist on ref "
                    f"'{settings.GH_ACTIONS_REF}' and the token can access them."
                )
            return result(False, error=f"workflow dispatch failed ({resp.status_code})")

        # The dispatch response carries no run id: poll until our run-name appears.
        run = None
        appear_deadline = time.time() + RUN_APPEAR_TIMEOUT
        while time.time() < appear_deadline:
            run = await _find_dispatched_run(client, repo, workflow, run_name, since)
            if run:
                break
            await asyncio.sleep(POLL_INTERVAL)
        if run is None:
            log("[SYSTEM ERROR] Dispatched run never appeared in the Actions API.")
            return result(False, error="dispatched run not found")

        log(f"[SYSTEM] CI run started: {run['html_url']}")

        # Wall-clock budget covers runner queueing + setup on top of the test's
        # own timeout, which the workflow enforces separately.
        run_deadline = time.time() + settings.GH_ACTIONS_RUN_TIMEOUT
        while run.get("status") != "completed" and time.time() < run_deadline:
            await asyncio.sleep(POLL_INTERVAL)
            resp = await client.get(f"{GITHUB_API}/repos/{repo}/actions/runs/{run['id']}")
            if resp.status_code == 200:
                run = resp.json()

        if run.get("status") != "completed":
            log(
                f"[SYSTEM ERROR] CI run did not finish within "
                f"{settings.GH_ACTIONS_RUN_TIMEOUT}s; cancelling it."
            )
            await client.post(f"{GITHUB_API}/repos/{repo}/actions/runs/{run['id']}/cancel")
            return result(False, error="timeout")

        data = await _download_result_artifact(client, repo, run["id"], f"result-{dispatch_id}")

    if data is None:
        # No artifact means the job died before the test could report (setup
        # failure, cancelled run, expired artifact) — not a test failure.
        log(
            f"[SYSTEM ERROR] CI run finished with conclusion "
            f"'{run.get('conclusion')}' but produced no result artifact. "
            f"Inspect the run: {run.get('html_url')}"
        )
        return result(False, error="CI run produced no result")

    for line in data.get("logs", []):
        log(f"[BROWSER] {line}")

    if data.get("success"):
        log("[SYSTEM] Test passed")
        return result(True)
    if data.get("timed_out"):
        log(f"[SYSTEM ERROR] Test execution timed out after {timeout}ms")
        return result(False, error="timeout")
    log(f"[SYSTEM ERROR] Test failed (exit code {data.get('exit_code')})")
    return result(False, error="Test assertions failed or the script errored")
