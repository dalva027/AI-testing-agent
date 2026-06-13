"""Authentication & authorization helpers.

Issues and validates short-lived app session tokens (JWT) and exposes the
`get_current_user` dependency used to protect every tenant-scoped endpoint.

The GitHub OAuth access token is *never* sent to the client; it stays in the
database (`User.github_access_token`) and is looked up server-side from the
authenticated user. The client only ever holds the app JWT below.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.models.models import User

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=True)

_OAUTH_STATE_PURPOSE = "github_oauth_state"


def create_access_token(user_id: int) -> str:
    """Mint a signed app session token for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_oauth_state() -> str:
    """Create a short-lived signed state token for CSRF protection on the OAuth flow."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {"purpose": _OAUTH_STATE_PURPOSE, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_oauth_state(state: str | None) -> bool:
    """Validate the signed OAuth state token returned by GitHub."""
    if not state:
        return False
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return False
    return payload.get("purpose") == _OAUTH_STATE_PURPOSE


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve and return the authenticated user from the Bearer token."""
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError, TypeError):
        raise auth_error

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise auth_error
    return user


def require_github_token(user: User) -> str:
    """Return the user's stored GitHub token or raise if they haven't connected GitHub."""
    if not user.github_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account is not connected. Please connect GitHub first.",
        )
    return user.github_access_token
