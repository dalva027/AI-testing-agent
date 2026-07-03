from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import TestRunOut, TestRunRequest
from app.models.models import TestCase, TestRun, User, Repository
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.playwright_service import generate_playwright_script, run_playwright_test
from app.services.github_service import get_github_file

router = APIRouter(prefix="/api/test-cases/run", tags=["test-execution"])

# Credits charged per individual test run (each run (re)generates and executes a
# Playwright script). Mirrored on the frontend.
RUN_COST = 3

# Extra generate+run cycles a failed run may spend repairing itself. Each heal
# attempt is a full run (LLM call + browser execution) and is charged RUN_COST.
MAX_HEAL_ATTEMPTS = 2


async def _charge_run(db: AsyncSession, user_id: int) -> int | None:
    """Atomically deduct RUN_COST if the balance allows it (no overspend under
    concurrency). Returns the new balance, or None when credits are insufficient.
    """
    res = await db.execute(
        update(User)
        .where(User.id == user_id, User.credits >= RUN_COST)
        .values(credits=User.credits - RUN_COST)
        .returning(User.credits)
    )
    row = res.first()
    await db.commit()
    return row[0] if row else None


async def _refund_run(db: AsyncSession, user_id: int) -> int | None:
    """Give back the RUN_COST credits charged for a run that produced no script.

    Returns the user's new balance, or None if the user row vanished.
    """
    res = await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits=User.credits + RUN_COST)
        .returning(User.credits)
    )
    row = res.first()
    await db.commit()
    return row[0] if row else None


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


@router.post("")
@router.post("/")
async def run_test_cases(
    body: TestRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate Playwright scripts and execute tests in a real browser."""
    results = []
    access_token = current_user.github_access_token
    remaining_credits = current_user.credits

    for tc_id in body.test_case_ids:
        result = await db.execute(
            select(TestCase).where(TestCase.id == tc_id, TestCase.user_id == current_user.id)
        )
        tc = result.scalar_one_or_none()
        if not tc:
            continue

        # Charge per test run up front. Refunded below if we can't produce a script.
        balance = await _charge_run(db, current_user.id)
        if balance is None:
            results.append({
                "test_case_id": tc_id,
                "status": "failed",
                "logs": [f"[SYSTEM ERROR] Insufficient credits. Each test run costs {RUN_COST} credits."],
                "error": "Insufficient credits",
            })
            continue
        remaining_credits = balance

        # Fetch repo for global instruction (only when the test case is linked to one).
        global_instruction = None
        if tc.repo_id:
            repo_result = await db.execute(
                select(Repository).where(
                    Repository.id == tc.repo_id, Repository.user_id == current_user.id
                )
            )
            repo = repo_result.scalar_one_or_none()
            global_instruction = repo.global_instruction if repo else None

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
        # instead of guessing the same way twice at temperature 0.
        script = tc.playwright_script
        all_logs: list[str] = []
        if body.mode == "generate" or not script:
            failure_context = await _last_failure(db, tc.id, current_user.id)
            if failure_context:
                all_logs.append("[SYSTEM] Regenerating with failure memory from the last failed run")
            try:
                script = await generate_playwright_script(
                    test_case=tc_payload,
                    target_files=target_files,
                    global_instruction=global_instruction,
                    base_url=body.base_url,
                    failure_context=failure_context,
                )
            except RuntimeError as e:
                remaining_credits = await _refund_run(db, current_user.id) or remaining_credits
                results.append({
                    "test_case_id": tc_id,
                    "status": "failed",
                    "logs": [f"[SYSTEM ERROR] {e}"],
                    "error": str(e),
                })
                continue
            if not script:
                remaining_credits = await _refund_run(db, current_user.id) or remaining_credits
                results.append({
                    "test_case_id": tc_id,
                    "status": "failed",
                    "logs": ["[SYSTEM ERROR] Failed to generate Playwright script"],
                    "error": "No script generated by AI",
                })
                continue
            tc.playwright_script = script
            await db.commit()

        # Execute in a real browser (isolated subprocess). On failure, self-heal:
        # regenerate the script from the failure output and re-run, up to
        # MAX_HEAL_ATTEMPTS extra charged attempts. Every attempt is persisted as
        # its own TestRun row so repairs stay auditable (a healed test still shows
        # its failed attempts in run history).
        heal_attempts = 0
        total_duration = 0.0
        while True:
            exec_result = await run_playwright_test(script, body.base_url)
            status = "passed" if exec_result["success"] else "failed"
            attempt_logs = exec_result["logs"]
            all_logs.extend(attempt_logs)
            total_duration += exec_result["duration_ms"]

            db.add(TestRun(
                test_case_id=tc.id,
                user_id=current_user.id,
                status=status,
                logs=attempt_logs,
                error_message=exec_result.get("error") if not exec_result["success"] else None,
                duration_ms=exec_result["duration_ms"],
                playwright_script_used=script,
            ))

            if exec_result["success"] or not body.heal or heal_attempts >= MAX_HEAL_ATTEMPTS:
                break

            # Heal attempts are full runs, so they are charged like one. Stop
            # healing (keeping the failed result) if credits run out. This also
            # commits the TestRun row added above.
            balance = await _charge_run(db, current_user.id)
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
            try:
                healed_script = await generate_playwright_script(
                    test_case=tc_payload,
                    target_files=target_files,
                    global_instruction=global_instruction,
                    base_url=body.base_url,
                    failure_context={"script": script, "logs": attempt_logs},
                )
            except RuntimeError as e:
                remaining_credits = await _refund_run(db, current_user.id) or remaining_credits
                all_logs.append(f"[SYSTEM ERROR] Self-heal generation failed: {e}")
                break
            if not healed_script:
                remaining_credits = await _refund_run(db, current_user.id) or remaining_credits
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


@router.get("/runs/{test_case_id}", response_model=list[TestRunOut])
async def get_test_runs(
    test_case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ensure the test case belongs to the caller before exposing its run history.
    owner = await db.execute(
        select(TestCase).where(TestCase.id == test_case_id, TestCase.user_id == current_user.id)
    )
    if owner.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Test case not found")

    result = await db.execute(
        select(TestRun)
        .where(TestRun.test_case_id == test_case_id, TestRun.user_id == current_user.id)
        .order_by(TestRun.created_at.desc())
    )
    return result.scalars().all()
