from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import UserOut
from app.models.models import User
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_oauth_state,
    get_current_user,
    verify_oauth_state,
)
from app.services.github_service import get_github_access_token, get_github_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _error_page(message: str, settings) -> HTMLResponse:
    return HTMLResponse(f"""
    <html><head><title>Auth Error</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:60px">
    <h2 style="color:#dc2626">GitHub Authentication Error</h2>
    <p>{message}</p>
    <a href="{settings.frontend_url}">Back to app</a>
    </body></html>""")


@router.get("/github/login")
async def github_login():
    """Redirect the browser to GitHub's OAuth consent screen."""
    settings = get_settings()
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=400, detail="GITHUB_CLIENT_ID not configured in .env")
    params = urlencode({
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "public_repo",
        "state": create_oauth_state(),
    })
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")


@router.get("/github/callback", response_class=HTMLResponse)
async def github_callback(
    code: str = Query(...),
    state: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """GitHub OAuth callback: exchange code for token, then redirect back to the frontend
    with a short-lived app session token (JWT) in the URL fragment. The GitHub access
    token itself is stored server-side only and never exposed to the client."""
    settings = get_settings()

    if not verify_oauth_state(state):
        return _error_page("Invalid or expired OAuth state. Please try connecting again.", settings)

    try:
        token_data = await get_github_access_token(code, settings.GITHUB_REDIRECT_URI)
        access_token = token_data.get("access_token")
        if not access_token:
            error = token_data.get("error_description", "Failed to get access token")
            return _error_page(error, settings)

        user_info = await get_github_user(access_token)

        result = await db.execute(select(User).where(User.github_user_id == str(user_info["id"])))
        user = result.scalar_one_or_none()

        if not user:
            user = User(
                name=user_info.get("name") or user_info.get("login"),
                email=user_info.get("email") or f"{user_info['login']}@github.local",
                github_access_token=access_token,
                github_user_id=str(user_info["id"]),
                github_username=user_info["login"],
                credits=1000,
            )
            db.add(user)
        else:
            user.github_access_token = access_token
            user.github_username = user_info["login"]
        await db.commit()
        await db.refresh(user)

        # Hand the client only an app JWT, carried in the URL fragment (not sent to
        # servers or logged in Referer headers like a query string would be).
        app_token = create_access_token(user.id)
        redirect_url = f"{settings.frontend_url}/workspace#token={app_token}"
        return HTMLResponse(f"""
        <html><head><title>Authenticating...</title>
        <script>window.location.replace("{redirect_url}");</script>
        </head><body>Redirecting... <a href="{redirect_url}">Continue</a></body></html>""")

    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        return _error_page(str(e), settings)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user
