from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import TestCaseOut
from app.models.models import TestCase, User
from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter(prefix="/api/test-cases", tags=["test-results"])


@router.get("/all", response_model=list[TestCaseOut])
async def get_all_test_cases(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all of the authenticated user's test cases (for the Test Results page)."""
    result = await db.execute(
        select(TestCase)
        .where(TestCase.user_id == current_user.id)
        .order_by(TestCase.created_at.desc())
    )
    return result.scalars().all()
