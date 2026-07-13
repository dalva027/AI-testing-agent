"""Test-case generation: analyze repo source on GitHub and store LLM-written
test cases. Extracted from testcase_routes so the agent can call it too.

Raises instead of returning HTTP errors so callers map failures themselves:
InsufficientCreditsError (402 at the route), ValueError for unusable input
(400), RuntimeError for AI-side failures (502).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Repository, TestCase, User
from app.services.ai_service import generate_test_cases, select_source_files
from app.services.github_service import get_github_file, get_github_repo_tree

GENERATION_COST = 200


class InsufficientCreditsError(Exception):
    def __init__(self, required: int):
        self.required = required
        super().__init__(f"Insufficient credits. Required: {required}")


async def generate_test_cases_for_repo(
    db: AsyncSession,
    user: User,
    repo: Repository,
    branch: str | None = None,
    extra_instruction: str | None = None,
) -> dict:
    """Generate and persist AI test cases for a connected repo.

    `extra_instruction` narrows generation for this call only (e.g. the agent
    focusing on one flow) and is layered on top of the repo's global_instruction.
    Returns {"count": int, "test_cases": [TestCase], "credits": int}.
    """
    if not user.github_access_token:
        raise ValueError("GitHub account is not connected. Please connect GitHub first.")
    token = user.github_access_token
    branch = branch or repo.default_branch or "main"

    # Fast-fail before spending an expensive AI call.
    if user.credits < GENERATION_COST:
        raise InsufficientCreditsError(GENERATION_COST)

    # Gather source files from GitHub.
    tree = await get_github_repo_tree(token, repo.owner, repo.name, branch)
    useful_files = select_source_files(tree, limit=25)

    file_contents = []
    for f in useful_files:
        content = await get_github_file(token, repo.owner, repo.name, f["path"], branch)
        if content:
            file_contents.append(content)

    if not file_contents:
        raise ValueError("No useful source files found in this repository")

    instruction = repo.global_instruction
    if extra_instruction:
        instruction = (
            f"{instruction}\nFocus for this generation: {extra_instruction}"
            if instruction
            else f"Focus for this generation: {extra_instruction}"
        )

    # Generate test cases with AI (raises RuntimeError when no provider works).
    ai_test_cases = await generate_test_cases(
        file_contents=file_contents,
        global_instruction=instruction,
        repo_name=repo.name,
        repo_owner=repo.owner,
        target_domain=repo.target_domain or "http://localhost:5173",
    )

    if not ai_test_cases:
        raise RuntimeError("AI failed to generate test cases")

    # Atomically re-check + deduct credits and insert in a single transaction
    # (row lock prevents concurrent generations from overspending).
    locked = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    locked_user = locked.scalar_one()
    if locked_user.credits < GENERATION_COST:
        raise InsufficientCreditsError(GENERATION_COST)
    locked_user.credits -= GENERATION_COST

    inserted = []
    for tc in ai_test_cases:
        test_case = TestCase(
            user_id=locked_user.id,
            repo_id=repo.id,
            repo_name=repo.name,
            repo_owner=repo.owner,
            branch=branch,
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

    return {"count": len(inserted), "test_cases": inserted, "credits": locked_user.credits}
