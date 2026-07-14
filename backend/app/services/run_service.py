"""Core test-run engine: generate script -> execute -> self-heal.

Extracted from testrun_routes so it can be called outside an HTTP request —
the /api/test-cases/run route and the agent's run_tests tool both delegate
here. All credit accounting for runs happens in this module.
"""

from typing import Awaitable, Callable, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Repository, TestCase, TestRun, User
from app.services.github_service import get_github_file
from app.services.playwright_service import generate_playwright_script, run_playwright_test

# Credits charged per individual test run (each run (re)generates and executes a
# Playwright script). Mirrored on the frontend.
RUN_COST = 3

# Extra generate+run cycles a failed run may spend repairing itself. Each heal
# attempt is a full run (LLM call + browser execution) and is charged RUN_COST.
MAX_HEAL_ATTEMPTS = 2

# Optional async callback invoked with short human-readable progress lines
# (used by the agent to surface live status while a batch runs).
ProgressCallback = Callable[[str], Awaitable[None]]


async def charge_credits(db: AsyncSession, user_id: int, amount: int) -> int | None:
    """Atomically deduct `amount` if the balance allows it (no overspend under
    concurrency). Returns the new balance, or None when credits are insufficient.
    """
    res = await db.execute(
        update(User)
        .where(User.id == user_id, User.credits >= amount)
        .values(credits=User.credits - amount)
        .returning(User.credits)
    )
    row = res.first()
    await db.commit()
    return row[0] if row else None


async def refund_credits(db: AsyncSession, user_id: int, amount: int) -> int | None:
    """Give back credits charged for work that produced nothing (e.g. a run whose
    script generation failed). Returns the new balance, or None if the user row
    vanished.
    """
    res = await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits=User.credits + amount)
        .returning(User.credits)
    )
    row = res.first()
    await db.commit()
    return row[0] if row else None


async def get_balance(db: AsyncSession, user_id: int) -> int:
    res = await db.execute(select(User.credits).where(User.id == user_id))
    balance = res.scalar_one_or_none()
    return balance if balance is not None else 0


async def _last_failure(db: AsyncSession, test_case_id: int, user_id: int) -> dict | None:
    """Failure memory: the most recent failed run's script + logs for a test case,
    shaped as the failure_context accepted by generate_playwright_script.
    """
    res = await db.execute(
        select(TestRun)
        .where(
            TestRun.test_case_id == test_case_id,
            TestRun.user_id == user_id,
            TestRun.status == "failed",
        )
        .order_by(TestRun.id.desc())
        .limit(1)
    )
    run = res.scalar_one_or_none()
    if run is None or not run.playwright_script_used:
        return None
    return {"script": run.playwright_script_used, "logs": run.logs or []}


async def execute_test_cases(
    db: AsyncSession,
    user: User,
    test_case_ids: list[int],
    base_url: str | None,
    mode: str = "generate",
    heal: bool = True,
    custom_prompt: str | None = None,
    generate_only: bool = False,
    on_progress: Optional[ProgressCallback] = None,
) -> dict:
    """Run a batch of test cases and return {"results": [...], "credits": int}.

    Per case: charge RUN_COST, generate (or reuse) the Playwright script, execute
    it in a real browser, and on failure self-heal up to MAX_HEAL_ATTEMPTS extra
    charged attempts. Every attempt is persisted as its own TestRun row so repairs
    stay auditable. Only reads user.id / user.github_access_token / user.credits,
    so callers may pass a User loaded from any session.

    Execution requires a target URL: repo-linked cases must have the repo's
    target_domain configured (a provided base_url overrides the URL used but
    never bypasses that guard); blocked cases fail without being charged.
    With generate_only=True the script is generated and cached but never
    executed (no TestRun row, tc.status untouched) — allowed with no URL.
    """
    results = []
    access_token = user.github_access_token
    remaining_credits = await get_balance(db, user.id)

    async def progress(msg: str):
        if on_progress:
            await on_progress(msg)

    for tc_id in test_case_ids:
        result = await db.execute(
            select(TestCase).where(TestCase.id == tc_id, TestCase.user_id == user.id)
        )
        tc = result.scalar_one_or_none()
        if not tc:
            continue

        # Fetch the repo first: both the target-URL guard and the global
        # instruction need it (only when the test case is linked to one).
        repo = None
        if tc.repo_id:
            repo_result = await db.execute(
                select(Repository).where(
                    Repository.id == tc.repo_id, Repository.user_id == user.id
                )
            )
            repo = repo_result.scalar_one_or_none()
        global_instruction = repo.global_instruction if repo else None

        # Execution needs a target URL; script generation doesn't. Guarded
        # BEFORE charging so blocked cases never cost credits.
        if not generate_only:
            if tc.repo_id and (repo is None or not (repo.target_domain or "").strip()):
                results.append({
                    "test_case_id": tc_id,
                    "status": "failed",
                    "logs": [
                        "[SYSTEM ERROR] No target URL configured for this repository. "
                        "Set it in repository settings before running tests."
                    ],
                    "error": "No target URL configured",
                    "heal_attempts": 0,
                    "healed": False,
                })
                continue
            if not tc.repo_id and not (base_url or "").strip():
                results.append({
                    "test_case_id": tc_id,
                    "status": "failed",
                    "logs": ["[SYSTEM ERROR] No base URL provided for this test case."],
                    "error": "No base URL provided",
                    "heal_attempts": 0,
                    "healed": False,
                })
                continue

        # A request-provided base_url overrides the repo's configured target for
        # this run. Generation prompts get an honest placeholder when neither is
        # known yet (generated scripts navigate by relative paths, so a missing
        # URL only affects prompt context, not the script's correctness).
        exec_base_url = (base_url or "").strip() or (
            (repo.target_domain or "").strip() if repo else ""
        )
        prompt_base_url = exec_base_url or "(not configured yet)"

        # Charge per test run up front. Refunded below if we can't produce a script.
        balance = await charge_credits(db, user.id, RUN_COST)
        if balance is None:
            results.append({
                "test_case_id": tc_id,
                "status": "failed",
                "logs": [f"[SYSTEM ERROR] Insufficient credits. Each test run costs {RUN_COST} credits."],
                "error": "Insufficient credits",
            })
            continue
        remaining_credits = balance

        if generate_only:
            await progress(f"Generating script for test case #{tc.id}: {tc.title}")
        else:
            await progress(f"Running test case #{tc.id}: {tc.title}")

        # Get target file contents for additional context.
        target_files = []
        if access_token and tc.target_files:
            for path in tc.target_files:
                content = await get_github_file(
                    access_token, tc.repo_owner, tc.repo_name, path, tc.branch
                )
                if content:
                    target_files.append(content)

        tc_payload = {
            "title": tc.title,
            "description": tc.description,
            "type": tc.test_type,
            "targetRoute": tc.target_route,
            "expectedResult": tc.expected_result,
        }

        # Generate or reuse the cached script. Regeneration is informed by the most
        # recent failed run (failure memory), so the model repairs the last mistake
        # instead of guessing the same way twice at temperature 0. generate_only
        # always regenerates (that is the point of the request).
        script = tc.playwright_script
        all_logs: list[str] = []
        if generate_only or mode == "generate" or not script:
            failure_context = await _last_failure(db, tc.id, user.id)
            if failure_context:
                all_logs.append("[SYSTEM] Regenerating with failure memory from the last failed run")
            try:
                script = await generate_playwright_script(
                    test_case=tc_payload,
                    target_files=target_files,
                    global_instruction=global_instruction,
                    base_url=prompt_base_url,
                    failure_context=failure_context,
                    custom_prompt=custom_prompt,
                )
            except RuntimeError as e:
                remaining_credits = await refund_credits(db, user.id, RUN_COST) or remaining_credits
                results.append({
                    "test_case_id": tc_id,
                    "status": "failed",
                    "logs": [f"[SYSTEM ERROR] {e}"],
                    "error": str(e),
                })
                continue
            if not script:
                remaining_credits = await refund_credits(db, user.id, RUN_COST) or remaining_credits
                results.append({
                    "test_case_id": tc_id,
                    "status": "failed",
                    "logs": ["[SYSTEM ERROR] Failed to generate Playwright script"],
                    "error": "No script generated by AI",
                })
                continue
            tc.playwright_script = script
            await db.commit()

        # Generate-only: the cached script IS the deliverable. No browser run,
        # no TestRun row, and tc.status/logs stay whatever the last real run set.
        if generate_only:
            all_logs.append(
                "[SYSTEM] Script generated and cached — no browser execution (generate-only)."
            )
            await progress(f"Test case #{tc.id}: script generated (no run)")
            results.append({
                "test_case_id": tc_id,
                "status": "script_generated",
                "logs": all_logs,
                "error": None,
                "playwright_script": script,
                "duration_ms": None,
                "heal_attempts": 0,
                "healed": False,
            })
            continue

        # Execute in a real browser (isolated subprocess). On failure, self-heal:
        # regenerate the script from the failure output and re-run, up to
        # MAX_HEAL_ATTEMPTS extra charged attempts. Every attempt is persisted as
        # its own TestRun row so repairs stay auditable (a healed test still shows
        # its failed attempts in run history).
        heal_attempts = 0
        total_duration = 0.0
        while True:
            exec_result = await run_playwright_test(script, exec_base_url)
            status = "passed" if exec_result["success"] else "failed"
            attempt_logs = exec_result["logs"]
            all_logs.extend(attempt_logs)
            total_duration += exec_result["duration_ms"]

            db.add(TestRun(
                test_case_id=tc.id,
                user_id=user.id,
                status=status,
                logs=attempt_logs,
                error_message=exec_result.get("error") if not exec_result["success"] else None,
                duration_ms=exec_result["duration_ms"],
                playwright_script_used=script,
            ))

            if exec_result["success"] or not heal or heal_attempts >= MAX_HEAL_ATTEMPTS:
                break

            # Heal attempts are full runs, so they are charged like one. Stop
            # healing (keeping the failed result) if credits run out. This also
            # commits the TestRun row added above.
            balance = await charge_credits(db, user.id, RUN_COST)
            if balance is None:
                all_logs.append(
                    f"[SYSTEM] Self-heal skipped: insufficient credits (each attempt costs {RUN_COST})."
                )
                break
            remaining_credits = balance

            heal_attempts += 1
            all_logs.append(
                f"[SYSTEM] Self-heal attempt {heal_attempts}/{MAX_HEAL_ATTEMPTS}: "
                "regenerating script from the failure output..."
            )
            await progress(
                f"Test case #{tc.id} failed — self-heal attempt {heal_attempts}/{MAX_HEAL_ATTEMPTS}"
            )
            try:
                healed_script = await generate_playwright_script(
                    test_case=tc_payload,
                    target_files=target_files,
                    global_instruction=global_instruction,
                    base_url=exec_base_url,
                    failure_context={"script": script, "logs": attempt_logs},
                    custom_prompt=custom_prompt,
                )
            except RuntimeError as e:
                remaining_credits = await refund_credits(db, user.id, RUN_COST) or remaining_credits
                all_logs.append(f"[SYSTEM ERROR] Self-heal generation failed: {e}")
                break
            if not healed_script:
                remaining_credits = await refund_credits(db, user.id, RUN_COST) or remaining_credits
                all_logs.append("[SYSTEM ERROR] Self-heal produced no script; keeping the failed result.")
                break
            script = healed_script
            tc.playwright_script = script

        if status == "passed" and heal_attempts:
            all_logs.append(f"[SYSTEM] Test passed after {heal_attempts} self-heal attempt(s)")

        tc.status = status
        tc.logs = all_logs
        tc.duration_ms = exec_result["duration_ms"]
        await db.commit()

        await progress(f"Test case #{tc.id} finished: {status}")

        results.append({
            "test_case_id": tc_id,
            "status": status,
            "logs": all_logs,
            "error": exec_result.get("error") if not exec_result["success"] else None,
            "playwright_script": script,
            "duration_ms": total_duration,
            "heal_attempts": heal_attempts,
            "healed": status == "passed" and heal_attempts > 0,
        })

    return {"results": results, "credits": remaining_credits}
