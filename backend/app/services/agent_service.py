"""The interactive testing agent.

A background tool-calling loop that turns a natural-language goal ("test the
checkout flow and report what breaks") into actions using the same services the
HTTP API exposes: listing/generating test cases, running them with self-heal,
reading repo source, and updating repo settings. Every step is persisted as an
AgentEvent row, which is both the chat transcript the frontend polls and the
exact conversation state the loop is rebuilt from after a pause (ask_user), a
follow-up message, or a server restart — nothing lives only in memory.

Runs as a plain asyncio task inside the web process (the free-tier deployment
has no worker dyno). Single-instance assumption: the in-memory `_running`
registry is only used to cancel/dedupe live loops; correctness comes from
Postgres.
"""

import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.models import AgentEvent, AgentTask, Repository, TestCase, TestRun, User
from app.services import run_service
from app.services.ai_service import call_ai_tools, select_source_files
from app.services.github_service import get_github_file, get_github_repo_tree
from app.services.testcase_service import (
    GENERATION_COST,
    InsufficientCreditsError,
    generate_test_cases_for_repo,
)

logger = logging.getLogger(__name__)

# Hard ceilings so a confused model cannot loop forever or drain an account.
MAX_STEPS = 24          # LLM calls per task before the loop force-fails
STEP_COST = 1           # credits charged per agent LLM call
MAX_RUN_BATCH = 10      # test cases per run_tests tool call
LOG_TAIL_LINES = 40     # runner log lines fed back to the model per result
TOOL_RESULT_MAX_CHARS = 15000  # cap on the JSON string a tool feeds the model

ACTIVE_STATUSES = {"queued", "running"}
RESUMABLE_STATUSES = {"awaiting_input", "completed", "failed", "cancelled", "stale"}

# Live loops for this process: cancel + dedupe only (state is in Postgres).
_running: dict[int, asyncio.Task] = {}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_test_cases",
            "description": (
                "List every test case for this repository: id, title, type, priority, "
                "current status and target route. Start here before generating new cases."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_test_cases",
            "description": (
                f"Analyze the repository source on GitHub and generate new test cases with "
                f"the LLM. EXPENSIVE ({GENERATION_COST} credits) — only use when existing "
                f"cases don't cover the task. `instruction` focuses generation on what the "
                f"task needs (e.g. 'only the checkout flow')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": "Optional focus for generation",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_tests",
            "description": (
                f"Execute test cases in a real browser against the repo's configured target "
                f"URL. Each attempt costs {run_service.RUN_COST} credits; failed runs "
                f"self-heal automatically (regenerate from failure output and retry, up to "
                f"{run_service.MAX_HEAL_ATTEMPTS} extra charged attempts) unless heal=false. "
                f"At most {MAX_RUN_BATCH} test cases per call. Runs can take minutes each."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "test_case_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "IDs of the test cases to run",
                    },
                    "custom_prompt": {
                        "type": "string",
                        "description": (
                            "Optional instructions steering script generation for this run "
                            "(forces regeneration)"
                        ),
                    },
                    "heal": {
                        "type": "boolean",
                        "description": "Self-heal failed runs (default true)",
                    },
                    "regenerate": {
                        "type": "boolean",
                        "description": (
                            "true = regenerate scripts even when cached; false (default) = "
                            "reuse cached scripts when present"
                        ),
                    },
                },
                "required": ["test_case_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_run_history",
            "description": "Recent runs for one test case: status, error and a log tail per attempt.",
            "parameters": {
                "type": "object",
                "properties": {
                    "test_case_id": {"type": "integer"},
                    "limit": {"type": "integer", "description": "Max runs to return (default 5)"},
                },
                "required": ["test_case_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stats",
            "description": "Pass/fail/pending counts and pass rate for this repository's test cases.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_repo_files",
            "description": "List the most test-relevant source file paths in the repo (max 100).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_repo_file",
            "description": "Read one source file from the repo (truncated to 8000 chars).",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_repo_settings",
            "description": (
                "Update the repo's target application URL and/or the global instructions "
                "injected into every generation prompt. Only when the task requires it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target_domain": {"type": "string", "description": "New target app URL"},
                    "global_instruction": {"type": "string", "description": "New global instructions"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_user",
            "description": (
                "Pause the task and ask the user a question you are blocked on "
                "(credentials, intent, which flow matters). Call it alone, not "
                "alongside other tools. The user's answer arrives as the next message."
            ),
            "parameters": {
                "type": "object",
                "properties": {"question": {"type": "string"}},
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "report",
            "description": (
                "Finish the task with a final report. ALWAYS end with this. `summary` is "
                "concise markdown: what ran, what passed/failed, root causes, recommendations."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "verdict": {
                        "type": "string",
                        "enum": ["passed", "failed", "mixed", "blocked"],
                    },
                },
                "required": ["summary", "verdict"],
            },
        },
    },
]


def _system_prompt(repo: Repository, task: AgentTask) -> str:
    return f"""You are Qira's autonomous QA agent, assigned testing tasks for the web application built from the GitHub repository {repo.full_name}.

Context:
- Target application URL (the deployed app under test): {repo.target_domain or 'not configured'}
- Repository default branch: {repo.default_branch}
- Global test instructions for this repo: {repo.global_instruction or 'none'}
- Credit budget for this task: {task.credits_budget} credits ({task.credits_spent} already spent). Each of your LLM steps costs {STEP_COST}, generating test cases costs {GENERATION_COST}, each test run attempt costs {run_service.RUN_COST}.

How to work:
1. Prefer existing test cases (list_test_cases) over generating new ones; generate_test_cases is expensive.
2. Use run_tests to execute cases in a real browser. Failed runs self-heal automatically. Use custom_prompt to steer script generation when the user's task needs specific behavior.
3. If the target application URL is 'not configured', run_tests will refuse — ask the user for the app's URL (ask_user) and set it with update_repo_settings before running tests. Generating test cases is still allowed without it.
4. Investigate failures (get_run_history, read_repo_file) before re-running blindly.
5. If you are blocked on something only the user knows, call ask_user and wait for their answer.
6. ALWAYS finish by calling report — a concise markdown summary of what ran, what passed/failed, likely root causes and recommendations, plus a verdict.

Rules:
- Keep assistant messages to one or two short sentences; put substance in the report.
- Never invent results; state only what tool output shows.
- Stay within the credit budget; if it runs low, wrap up and report what you have."""


# ---------------------------------------------------------------------------
# Event persistence and conversation rebuild
# ---------------------------------------------------------------------------

async def add_event(
    db: AsyncSession,
    task_id: int,
    role: str,
    content: str | None = None,
    *,
    tool_name: str | None = None,
    tool_call_id: str | None = None,
    tool_calls: list | None = None,
    tool_args: dict | None = None,
    tool_result=None,
) -> AgentEvent:
    ev = AgentEvent(
        task_id=task_id,
        role=role,
        content=content,
        tool_name=tool_name,
        tool_call_id=tool_call_id,
        tool_calls=tool_calls,
        tool_args=tool_args,
        tool_result=tool_result,
    )
    db.add(ev)
    await db.commit()
    return ev


async def _load_events(db: AsyncSession, task_id: int) -> list[AgentEvent]:
    res = await db.execute(
        select(AgentEvent).where(AgentEvent.task_id == task_id).order_by(AgentEvent.id.asc())
    )
    return list(res.scalars().all())


async def _heal_dangling_tool_calls(db: AsyncSession, task_id: int, events: list[AgentEvent]) -> list[AgentEvent]:
    """Synthesize tool results for calls interrupted before they finished.

    A restart mid-tool leaves an assistant event whose tool_calls have no
    matching tool events; the providers reject such conversations, so answer
    them with an explicit "interrupted" result and let the model re-issue.
    """
    answered = {ev.tool_call_id for ev in events if ev.role == "tool" and ev.tool_call_id}
    healed = False
    for ev in events:
        if ev.role != "assistant" or not ev.tool_calls:
            continue
        for call in ev.tool_calls:
            call_id = call.get("id")
            if call_id and call_id not in answered:
                result = {
                    "error": (
                        "This tool call was interrupted (server restart) before it "
                        "finished. Re-issue it if the work is still needed."
                    )
                }
                await add_event(
                    db,
                    task_id,
                    "tool",
                    content=json.dumps(result),
                    tool_name=call.get("function", {}).get("name"),
                    tool_call_id=call_id,
                    tool_result=result,
                )
                answered.add(call_id)
                healed = True
    return await _load_events(db, task_id) if healed else events


def _events_to_messages(events: list[AgentEvent]) -> list[dict]:
    """Rebuild the OpenAI-format conversation from persisted events.

    'progress' events are display-only and excluded; 'system' events (restart
    notes etc.) are folded in as user messages so there is a single real system
    message (the prompt) at the top.
    """
    messages: list[dict] = []
    for ev in events:
        if ev.role == "user":
            messages.append({"role": "user", "content": ev.content or ""})
        elif ev.role == "system":
            messages.append({"role": "user", "content": f"[SYSTEM NOTE] {ev.content or ''}"})
        elif ev.role == "assistant":
            msg: dict = {"role": "assistant", "content": ev.content or None}
            if ev.tool_calls:
                msg["tool_calls"] = ev.tool_calls
            messages.append(msg)
        elif ev.role == "tool":
            messages.append({
                "role": "tool",
                "tool_call_id": ev.tool_call_id,
                "content": ev.content or "",
            })
    return messages


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _log_tail(logs: list | None, lines: int = LOG_TAIL_LINES) -> list[str]:
    logs = logs or []
    return logs[-lines:] if len(logs) > lines else logs


async def _execute_tool(
    db: AsyncSession,
    task: AgentTask,
    user: User,
    repo: Repository,
    name: str,
    args: dict,
):
    """Run one tool and return a JSON-serializable result. Never raises: tool
    failures come back as {"error": ...} so the model can react to them."""
    try:
        if name == "list_test_cases":
            res = await db.execute(
                select(TestCase)
                .where(TestCase.repo_id == repo.id, TestCase.user_id == user.id)
                .order_by(TestCase.id.asc())
            )
            return [
                {
                    "id": tc.id,
                    "title": tc.title,
                    "type": tc.test_type,
                    "priority": tc.priority,
                    "status": tc.status,
                    "target_route": tc.target_route,
                }
                for tc in res.scalars().all()
            ]

        if name == "generate_test_cases":
            outcome = await generate_test_cases_for_repo(
                db, user, repo,
                branch=repo.default_branch,
                extra_instruction=args.get("instruction"),
            )
            return {
                "generated": outcome["count"],
                "test_cases": [
                    {"id": tc.id, "title": tc.title, "type": tc.test_type, "priority": tc.priority}
                    for tc in outcome["test_cases"]
                ],
                "credits_remaining": outcome["credits"],
            }

        if name == "run_tests":
            # Execution is blocked until the repo has a configured target URL;
            # the model is told how to unblock itself (or the user).
            if not (repo.target_domain or "").strip():
                return {
                    "error": (
                        "No target URL configured for this repository, so tests cannot "
                        "be executed. Ask the user for the app's URL (ask_user) or set "
                        "it via update_repo_settings, then retry."
                    )
                }
            ids = [int(i) for i in args.get("test_case_ids") or []]
            if not ids:
                return {"error": "test_case_ids is required and must be non-empty"}
            truncated = len(ids) > MAX_RUN_BATCH
            ids = ids[:MAX_RUN_BATCH]
            custom_prompt = args.get("custom_prompt")
            # A custom prompt only matters if the script is regenerated with it.
            mode = "generate" if (args.get("regenerate") or custom_prompt) else "reuse"

            async def progress(msg: str):
                await add_event(db, task.id, "progress", msg)

            outcome = await run_service.execute_test_cases(
                db, user, ids,
                base_url=repo.target_domain,
                mode=mode,
                heal=args.get("heal", True),
                custom_prompt=custom_prompt,
                on_progress=progress,
            )
            results = [
                {
                    "test_case_id": r["test_case_id"],
                    "status": r["status"],
                    "error": r.get("error"),
                    "heal_attempts": r.get("heal_attempts", 0),
                    "healed": r.get("healed", False),
                    "duration_ms": r.get("duration_ms"),
                    "log_tail": _log_tail(r.get("logs")),
                }
                for r in outcome["results"]
            ]
            payload = {"results": results, "credits_remaining": outcome["credits"]}
            if truncated:
                payload["note"] = f"only the first {MAX_RUN_BATCH} test cases were run (batch cap)"
            return payload

        if name == "get_run_history":
            tc_id = int(args["test_case_id"])
            owner = await db.execute(
                select(TestCase).where(TestCase.id == tc_id, TestCase.user_id == user.id)
            )
            if owner.scalar_one_or_none() is None:
                return {"error": f"test case {tc_id} not found"}
            limit = min(int(args.get("limit") or 5), 20)
            res = await db.execute(
                select(TestRun)
                .where(TestRun.test_case_id == tc_id, TestRun.user_id == user.id)
                .order_by(TestRun.id.desc())
                .limit(limit)
            )
            return [
                {
                    "run_id": run.id,
                    "status": run.status,
                    "error": run.error_message,
                    "created_at": run.created_at.isoformat() if run.created_at else None,
                    "log_tail": _log_tail(run.logs, 25),
                }
                for run in res.scalars().all()
            ]

        if name == "get_stats":
            res = await db.execute(
                select(TestCase.status).where(
                    TestCase.repo_id == repo.id, TestCase.user_id == user.id
                )
            )
            statuses = [row[0] for row in res.all()]
            total = len(statuses)
            passed = sum(1 for s in statuses if s == "passed")
            failed = sum(1 for s in statuses if s == "failed")
            return {
                "total_tests": total,
                "passed_tests": passed,
                "failed_tests": failed,
                "pending_tests": total - passed - failed,
                "pass_rate": round(passed / total * 100, 1) if total else 0.0,
            }

        if name == "list_repo_files":
            if not user.github_access_token:
                return {"error": "GitHub account is not connected"}
            tree = await get_github_repo_tree(
                user.github_access_token, repo.owner, repo.name, repo.default_branch
            )
            return {"paths": [f["path"] for f in select_source_files(tree, limit=100)]}

        if name == "read_repo_file":
            if not user.github_access_token:
                return {"error": "GitHub account is not connected"}
            content = await get_github_file(
                user.github_access_token, repo.owner, repo.name,
                args["path"], repo.default_branch,
            )
            return content if content else {"error": f"file not found: {args.get('path')}"}

        if name == "update_repo_settings":
            if args.get("target_domain") is not None:
                repo.target_domain = args["target_domain"]
            if args.get("global_instruction") is not None:
                repo.global_instruction = args["global_instruction"]
            await db.commit()
            return {
                "target_domain": repo.target_domain,
                "global_instruction": repo.global_instruction,
            }

        return {"error": f"unknown tool: {name}"}

    except InsufficientCreditsError as e:
        return {"error": str(e)}
    except (KeyError, TypeError, ValueError) as e:
        return {"error": f"bad arguments for {name}: {e}"}
    except RuntimeError as e:
        return {"error": str(e)}
    except Exception as e:  # noqa: BLE001 - a tool bug must not kill the task
        logger.exception("agent tool %s crashed (task %s)", name, task.id)
        return {"error": f"{type(e).__name__}: {e}"}


# ---------------------------------------------------------------------------
# The loop
# ---------------------------------------------------------------------------

async def _finalize(
    db: AsyncSession,
    task: AgentTask,
    status: str,
    *,
    result: str | None = None,
    verdict: str | None = None,
    error: str | None = None,
    note: str | None = None,
):
    task.status = status
    if result is not None:
        task.result = result
    if verdict is not None:
        task.verdict = verdict
    if error is not None:
        task.error = error
    await db.commit()
    if note:
        await add_event(db, task.id, "system", note)


async def _agent_loop(db: AsyncSession, task_id: int):
    task = await db.get(AgentTask, task_id)
    if task is None or task.status not in ("queued", "running"):
        return

    user = await db.get(User, task.user_id)
    repo_res = await db.execute(
        select(Repository).where(
            Repository.id == task.repo_id, Repository.user_id == task.user_id
        )
    )
    repo = repo_res.scalar_one_or_none()
    if user is None or repo is None:
        await _finalize(db, task, "failed", error="Repository or user no longer exists",
                        note="Task failed: repository or user no longer exists.")
        return

    task.status = "running"
    await db.commit()

    events = await _load_events(db, task_id)
    events = await _heal_dangling_tool_calls(db, task_id, events)
    messages = [{"role": "system", "content": _system_prompt(repo, task)}]
    messages.extend(_events_to_messages(events))

    budget_warned = False

    for _step in range(MAX_STEPS):
        # Budget gate: warn the model once so it can wrap up; hard-stop after.
        if task.credits_spent >= task.credits_budget:
            if budget_warned:
                await _finalize(
                    db, task, "failed",
                    error="Credit budget exhausted before the task finished",
                    note="Task stopped: credit budget exhausted.",
                )
                return
            budget_warned = True
            warning = (
                "Credit budget for this task is exhausted. Stop all other work and "
                "call report NOW with what you have."
            )
            await add_event(db, task_id, "system", warning)
            messages.append({"role": "user", "content": f"[SYSTEM NOTE] {warning}"})

        # Each LLM step is charged to the user like any other metered action.
        balance = await run_service.charge_credits(db, user.id, STEP_COST)
        if balance is None:
            await _finalize(
                db, task, "failed",
                error="Insufficient account credits to continue",
                note="Task stopped: the account ran out of credits.",
            )
            return
        task.credits_spent += STEP_COST
        await db.commit()

        try:
            reply = await call_ai_tools(messages, TOOLS)
        except RuntimeError as e:
            await _finalize(db, task, "failed", error=str(e),
                            note=f"Task failed: {e}")
            return

        raw_calls = [
            {
                "id": c["id"],
                "type": "function",
                "function": {"name": c["name"], "arguments": json.dumps(c["arguments"])},
            }
            for c in reply["tool_calls"]
        ]
        await add_event(
            db, task_id, "assistant",
            content=reply["content"] or None,
            tool_calls=raw_calls or None,
        )
        assistant_msg: dict = {"role": "assistant", "content": reply["content"] or None}
        if raw_calls:
            assistant_msg["tool_calls"] = raw_calls
        messages.append(assistant_msg)

        if not raw_calls:
            # No tool call: the model answered in plain text. Treat it as the
            # final word so the task can't dangle without a report.
            if reply["content"].strip():
                await _finalize(db, task, "completed", result=reply["content"].strip())
            else:
                await _finalize(db, task, "failed",
                                error="The model returned an empty response",
                                note="Task failed: the model returned an empty response.")
            return

        for call in reply["tool_calls"]:
            name, args, call_id = call["name"], call["arguments"], call["id"]

            if name == "ask_user":
                question = str(args.get("question") or "").strip() or "(no question provided)"
                # Ack the call immediately so the conversation stays well-formed;
                # the user's answer arrives later as a normal user message.
                result = {"status": "waiting", "question": question}
                await add_event(
                    db, task_id, "tool",
                    content=json.dumps(result),
                    tool_name=name, tool_call_id=call_id,
                    tool_args=args, tool_result=result,
                )
                task.status = "awaiting_input"
                await db.commit()
                return

            if name == "report":
                summary = str(args.get("summary") or "").strip()
                verdict = args.get("verdict") if args.get("verdict") in (
                    "passed", "failed", "mixed", "blocked"
                ) else None
                result = {"status": "reported"}
                await add_event(
                    db, task_id, "tool",
                    content=json.dumps(result),
                    tool_name=name, tool_call_id=call_id,
                    tool_args=args, tool_result=result,
                )
                await _finalize(db, task, "completed", result=summary or None, verdict=verdict)
                return

            # Meter the tool's own spending (runs, generation) by balance delta.
            balance_before = await run_service.get_balance(db, user.id)
            result = await _execute_tool(db, task, user, repo, name, args)
            balance_after = await run_service.get_balance(db, user.id)
            if balance_after < balance_before:
                task.credits_spent += balance_before - balance_after
                await db.commit()

            content = json.dumps(result)
            if len(content) > TOOL_RESULT_MAX_CHARS:
                content = content[:TOOL_RESULT_MAX_CHARS] + '... [truncated]"}'
            await add_event(
                db, task_id, "tool",
                content=content,
                tool_name=name, tool_call_id=call_id,
                tool_args=args, tool_result=result,
            )
            messages.append({"role": "tool", "tool_call_id": call_id, "content": content})

    await _finalize(
        db, task, "failed",
        error=f"Reached the step limit ({MAX_STEPS} LLM calls) without a final report",
        note=f"Task stopped: step limit ({MAX_STEPS} LLM calls) reached.",
    )


async def _run_loop(task_id: int):
    try:
        async with async_session() as db:
            await _agent_loop(db, task_id)
    except asyncio.CancelledError:
        async with async_session() as db:
            task = await db.get(AgentTask, task_id)
            if task and task.status not in ("completed", "failed"):
                task.status = "cancelled"
                await db.commit()
                await add_event(db, task_id, "system", "Task cancelled by the user.")
        raise
    except Exception as e:  # noqa: BLE001 - the loop must never die silently
        logger.exception("agent loop crashed (task %s)", task_id)
        try:
            async with async_session() as db:
                task = await db.get(AgentTask, task_id)
                if task and task.status in ("queued", "running"):
                    task.status = "failed"
                    task.error = f"{type(e).__name__}: {e}"
                    await db.commit()
                    await add_event(db, task_id, "system", f"Task crashed: {e}")
        except Exception:  # noqa: BLE001
            logger.exception("failed to record agent crash (task %s)", task_id)


def spawn_agent_loop(task_id: int) -> bool:
    """Start (or refuse to double-start) the background loop for a task."""
    existing = _running.get(task_id)
    if existing and not existing.done():
        return False
    loop_task = asyncio.create_task(_run_loop(task_id))
    _running[task_id] = loop_task

    def _cleanup(t: asyncio.Task, tid: int = task_id):
        if _running.get(tid) is t:
            _running.pop(tid, None)

    loop_task.add_done_callback(_cleanup)
    return True


def cancel_agent_loop(task_id: int) -> bool:
    """Cancel a live loop. Returns False when no loop is running here (the
    caller still updates the DB status)."""
    loop_task = _running.get(task_id)
    if loop_task and not loop_task.done():
        loop_task.cancel()
        return True
    return False


async def sweep_interrupted_tasks():
    """Startup sweep: any task left queued/running belongs to a previous
    process and its loop is gone. Mark it stale (resumable via a message)
    so the UI never shows a zombie spinner. awaiting_input tasks are fine —
    they have no loop by design."""
    async with async_session() as db:
        res = await db.execute(
            select(AgentTask).where(AgentTask.status.in_(["queued", "running"]))
        )
        tasks = list(res.scalars().all())
        for task in tasks:
            task.status = "stale"
            await db.commit()
            await add_event(
                db, task.id, "system",
                "Interrupted by a server restart. Send a message to resume this task.",
            )
        if tasks:
            logger.info("marked %d interrupted agent task(s) stale", len(tasks))
