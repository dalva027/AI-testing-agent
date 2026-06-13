import base64

import httpx

from app.core.config import get_settings


async def get_github_access_token(code: str, redirect_uri: str) -> dict:
    """Exchange GitHub OAuth code for access token."""
    settings = get_settings()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def get_github_user(token: str) -> dict:
    """Get current GitHub user info."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_github_repos(token: str, page: int = 1, per_page: int = 30) -> list:
    """List GitHub repos for the authenticated user."""
    async with httpx.AsyncClient() as client:
        params = {"page": page, "per_page": per_page, "sort": "updated"}
        resp = await client.get(
            "https://api.github.com/user/repos",
            params=params,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_github_repo_tree(token: str, owner: str, repo: str, branch: str = "main") -> list:
    """Get recursive file tree from a GitHub repo."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return [
            item for item in data.get("tree", [])
            if item["type"] == "blob"
        ]


async def get_github_file(token: str, owner: str, repo: str, path: str, branch: str = "main") -> dict | None:
    """Get contents of a file from GitHub."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data.get("content"):
            return None
        decoded = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        return {"path": data["path"], "content": decoded[:8000]}
