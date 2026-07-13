from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import TestCaseOut, TestCaseGenerate, TestCaseUpdate
from app.models.models import TestCase, Repository, User
from app.core.database import get_db
from app.core.security import get_current_user, require_github_token
from app.services.testcase_service import (
    GENERATION_COST,
    InsufficientCreditsError,
    generate_test_cases_for_repo,
)

router = APIRouter(prefix="/api/test-cases", tags=["test-cases"])


async def _get_owned_test_case(test_case_id: int, user: User, db: AsyncSession) -> TestCase:
    result = await db.execute(
        select(TestCase).where(TestCase.id == test_case_id, TestCase.user_id == user.id)
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")
    return tc


async def _get_owned_repo(repo_id: int, user: User, db: AsyncSession) -> Repository:
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.user_id == user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.get("/repo/{repo_id}", response_model=list[TestCaseOut])
async def get_test_cases(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_repo(repo_id, current_user, db)
    result = await db.execute(
        select(TestCase)
        .where(TestCase.repo_id == repo_id, TestCase.user_id == current_user.id)
        .order_by(desc(TestCase.created_at))
    )
    return result.scalars().all()


@router.post("/generate")
async def generate_test_cases_endpoint(
    body: TestCaseGenerate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze repo files and generate AI test cases."""
    require_github_token(current_user)
    repo = await _get_owned_repo(body.repo_id, current_user, db)

    # The generation flow itself lives in testcase_service (shared with the agent).
    try:
        outcome = await generate_test_cases_for_repo(
            db, current_user, repo, branch=body.branch
        )
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "success": True,
        "count": outcome["count"],
        "test_cases": [TestCaseOut.model_validate(tc) for tc in outcome["test_cases"]],
        "credits": outcome["credits"],
    }


@router.get("/stats/{repo_id}")
async def get_test_stats(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_repo(repo_id, current_user, db)
    result = await db.execute(
        select(TestCase).where(TestCase.repo_id == repo_id, TestCase.user_id == current_user.id)
    )
    all_cases = result.scalars().all()

    total = len(all_cases)
    passed = sum(1 for tc in all_cases if tc.status == "passed")
    failed = sum(1 for tc in all_cases if tc.status == "failed")
    pending = total - passed - failed
    pass_rate = (passed / total * 100) if total > 0 else 0.0

    return {
        "total_tests": total,
        "passed_tests": passed,
        "failed_tests": failed,
        "pending_tests": pending,
        "pass_rate": round(pass_rate, 1),
    }


@router.patch("/{test_case_id}", response_model=TestCaseOut)
async def update_test_case(
    test_case_id: int,
    body: TestCaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tc = await _get_owned_test_case(test_case_id, current_user, db)
    if body.title is not None:
        tc.title = body.title
    if body.description is not None:
        tc.description = body.description
    if body.target_route is not None:
        tc.target_route = body.target_route
    if body.expected_result is not None:
        tc.expected_result = body.expected_result
    if body.playwright_script is not None:
        tc.playwright_script = body.playwright_script
    await db.commit()
    await db.refresh(tc)
    return tc


@router.delete("/{test_case_id}")
async def delete_test_case(
    test_case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tc = await _get_owned_test_case(test_case_id, current_user, db)
    await db.delete(tc)
    await db.commit()
    return {"message": "Test case deleted"}
