from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import TestRunOut, TestRunRequest
from app.models.models import TestCase, TestRun, User
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.run_service import execute_test_cases

router = APIRouter(prefix="/api/test-cases/run", tags=["test-execution"])


@router.post("")
@router.post("/")
async def run_test_cases(
    body: TestRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate Playwright scripts and execute tests in a real browser.

    The actual generate -> execute -> self-heal loop lives in
    app.services.run_service so the agent can drive it too.
    """
    return await execute_test_cases(
        db,
        current_user,
        test_case_ids=body.test_case_ids,
        base_url=body.base_url,
        mode=body.mode,
        heal=body.heal,
        custom_prompt=body.custom_prompt,
    )


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
