from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import RepoOut, RepoConnect, RepoUpdate
from app.models.models import Repository, User
from app.core.database import get_db
from app.core.security import get_current_user, require_github_token
from app.services.github_service import get_github_repos

router = APIRouter(prefix="/api/repos", tags=["repositories"])


async def _get_owned_repo(repo_id: int, user: User, db: AsyncSession) -> Repository:
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.user_id == user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.get("/github")
async def get_github_repositories(
    page: int = 1,
    current_user: User = Depends(get_current_user),
):
    """Get list of GitHub repos for the authenticated user (uses the server-side token)."""
    token = require_github_token(current_user)
    return await get_github_repos(token, page=page, per_page=30)


@router.get("", response_model=list[RepoOut])
@router.get("/", response_model=list[RepoOut])
async def get_user_repositories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all repositories connected by the authenticated user."""
    result = await db.execute(
        select(Repository)
        .where(Repository.user_id == current_user.id)
        .order_by(desc(Repository.updated_at))
    )
    return result.scalars().all()


@router.post("", response_model=RepoOut)
@router.post("/", response_model=RepoOut)
async def add_repository(
    body: RepoConnect,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a GitHub repository to the user's workspace."""
    result = await db.execute(
        select(Repository).where(
            Repository.user_id == current_user.id, Repository.repo_id == body.repo_id
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    repo = Repository(
        user_id=current_user.id,
        repo_id=body.repo_id,
        name=body.name,
        full_name=body.full_name,
        html_url=body.html_url,
        owner=body.owner,
        description=body.description,
        language=body.language,
        default_branch=body.default_branch,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    return repo


@router.get("/{repo_id}", response_model=RepoOut)
async def get_repository(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_owned_repo(repo_id, current_user, db)


@router.delete("/{repo_id}")
async def remove_repository(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = await _get_owned_repo(repo_id, current_user, db)
    await db.delete(repo)
    await db.commit()
    return {"message": "Repository removed"}


@router.patch("/{repo_id}", response_model=RepoOut)
async def update_repository(
    repo_id: int,
    body: RepoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = await _get_owned_repo(repo_id, current_user, db)
    if body.target_domain is not None:
        repo.target_domain = body.target_domain
    if body.global_instruction is not None:
        repo.global_instruction = body.global_instruction
    await db.commit()
    await db.refresh(repo)
    return repo
