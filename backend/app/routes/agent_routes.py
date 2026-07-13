"""Interactive agent API: create tasks, poll transcripts, reply, cancel.

The agent itself runs as a background loop (app.services.agent_service);
these routes only manage AgentTask rows and event polling. Long-running work
never blocks an HTTP request here — POST returns immediately and the frontend
polls GET /tasks/{id}?after_id=N for new events.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import AgentEvent, AgentTask, Repository, User
from app.schemas.schemas import (
    AgentEventOut,
    AgentMessageIn,
    AgentTaskCreate,
    AgentTaskDetail,
    AgentTaskOut,
)
from app.services.agent_service import (
    ACTIVE_STATUSES,
    cancel_agent_loop,
    add_event,
    spawn_agent_loop,
)

router = APIRouter(prefix="/api/agent", tags=["agent"])


async def _get_owned_task(task_id: int, user: User, db: AsyncSession) -> AgentTask:
    result = await db.execute(
        select(AgentTask).where(AgentTask.id == task_id, AgentTask.user_id == user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Agent task not found")
    return task


@router.post("/tasks", response_model=AgentTaskOut)
async def create_task(
    body: AgentTaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assign the agent a task; returns immediately while the loop runs in
    the background."""
    repo_res = await db.execute(
        select(Repository).where(
            Repository.id == body.repo_id, Repository.user_id == current_user.id
        )
    )
    if repo_res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Repository not found")

    task = AgentTask(
        user_id=current_user.id,
        repo_id=body.repo_id,
        goal=body.goal.strip(),
        status="queued",
        credits_budget=body.credits_budget,
        credits_spent=0,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # The goal is the first user message of the conversation.
    await add_event(db, task.id, "user", task.goal)

    spawn_agent_loop(task.id)
    return task


@router.get("/tasks", response_model=list[AgentTaskOut])
async def list_tasks(
    repo_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(AgentTask).where(AgentTask.user_id == current_user.id)
    if repo_id is not None:
        query = query.where(AgentTask.repo_id == repo_id)
    result = await db.execute(query.order_by(desc(AgentTask.id)).limit(50))
    return result.scalars().all()


@router.get("/tasks/{task_id}", response_model=AgentTaskDetail)
async def get_task(
    task_id: int,
    after_id: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Task status + events newer than `after_id` (the polling cursor)."""
    task = await _get_owned_task(task_id, current_user, db)
    result = await db.execute(
        select(AgentEvent)
        .where(AgentEvent.task_id == task.id, AgentEvent.id > after_id)
        .order_by(AgentEvent.id.asc())
    )
    events = result.scalars().all()
    return {"task": task, "events": events}


@router.post("/tasks/{task_id}/messages", response_model=AgentTaskOut)
async def send_message(
    task_id: int,
    body: AgentMessageIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reply to a waiting agent or follow up on a finished/stale task; both
    re-queue the loop with the full prior conversation."""
    task = await _get_owned_task(task_id, current_user, db)
    if task.status in ACTIVE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="The agent is currently working on this task. Cancel it first or wait.",
        )

    await add_event(db, task.id, "user", body.content.strip())
    task.status = "queued"
    await db.commit()
    await db.refresh(task)

    spawn_agent_loop(task.id)
    return task


@router.post("/tasks/{task_id}/cancel", response_model=AgentTaskOut)
async def cancel_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_owned_task(task_id, current_user, db)
    if task.status not in ACTIVE_STATUSES and task.status != "awaiting_input":
        raise HTTPException(status_code=409, detail="Task is not running")

    had_live_loop = cancel_agent_loop(task.id)
    # The cancelled loop also writes this status, but it may be mid-await for
    # minutes (a CI run); setting it here makes cancellation immediate for the
    # UI. If no loop is alive (e.g. pre-restart task), this is the only writer.
    task.status = "cancelled"
    await db.commit()
    if not had_live_loop:
        await add_event(db, task.id, "system", "Task cancelled by the user.")
    await db.refresh(task)
    return task
