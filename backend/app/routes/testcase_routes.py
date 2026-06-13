from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import TestCaseOut, TestCaseGenerate, TestCaseUpdate
from app.models.models import TestCase, Repository, User
from app.core.database import get_db
from app.core.security import get_current_user, require_github_token
from app.services.github_service import get_github_file, get_github_repo_tree
from app.services.ai_service import generate_test_cases, is_useful_file

router = APIRouter(prefix="/api/test-cases", tags=["test-cases"])

GENERATION_COST = 200


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
    token = require_github_token(current_user)
    repo = await _get_owned_repo(body.repo_id, current_user, db)

    # Fast-fail before spending an expensive AI call.
    if current_user.credits < GENERATION_COST:
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Required: {GENERATION_COST}")

    # Gather source files from GitHub.
    tree = await get_github_repo_tree(token, repo.owner, repo.name, body.branch)
    useful_files = [f for f in tree if is_useful_file(f["path"])][:25]

    file_contents = []
    for f in useful_files:
        content = await get_github_file(token, repo.owner, repo.name, f["path"], body.branch)
        if content:
            file_contents.append(content)

    if not file_contents:
        raise HTTPException(status_code=400, detail="No useful source files found in this repository")

    # Generate test cases with AI.
    try:
        ai_test_cases = await generate_test_cases(
            file_contents=file_contents,
            global_instruction=repo.global_instruction,
            repo_name=repo.name,
            repo_owner=repo.owner,
            target_domain=repo.target_domain or "http://localhost:5173",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not ai_test_cases:
        raise HTTPException(status_code=500, detail="AI failed to generate test cases")

    # Atomically re-check + deduct credits and insert in a single transaction
    # (row lock prevents concurrent generations from overspending).
    locked = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = locked.scalar_one()
    if user.credits < GENERATION_COST:
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Required: {GENERATION_COST}")
    user.credits -= GENERATION_COST

    inserted = []
    for tc in ai_test_cases:
        test_case = TestCase(
            user_id=user.id,
            repo_id=repo.id,
            repo_name=repo.name,
            repo_owner=repo.owner,
            branch=body.branch,
            title=tc.get("title", ""),
            description=tc.get("description", ""),
            test_type=tc.get("type", "ui"),
            priority=tc.get("priority", "medium"),
            target_route=tc.get("targetRoute"),
            target_files=tc.get("targetFiles", []),
            expected_result=tc.get("expectedResult"),
            status="generated",
        )
        db.add(test_case)
        inserted.append(test_case)

    await db.commit()
    for tc in inserted:
        await db.refresh(tc)

    return {
        "success": True,
        "count": len(inserted),
        "test_cases": [TestCaseOut.model_validate(tc) for tc in inserted],
        "credits": user.credits,
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
