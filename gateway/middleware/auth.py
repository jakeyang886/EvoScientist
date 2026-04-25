"""Authentication middleware — JWT validation and user injection."""

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from gateway.utils.jwt import verify_token

logger = logging.getLogger(__name__)

SKIP_PATHS = [
    "/health",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email",
]


class AuthMiddleware(BaseHTTPMiddleware):
    """Validate JWT on every request (except skip paths).

    On success: injects user_uid and user_id into request.state.
    On failure: returns 401 JSONResponse.
    """

    def __init__(self, app, skip_paths=None):
        super().__init__(app)
        self.skip_paths = skip_paths or SKIP_PATHS

    async def dispatch(self, request: Request, call_next):
        # Skip paths that don't require authentication
        if any(request.url.path.startswith(p) for p in self.skip_paths):
            return await call_next(request)

        # Always allow CORS preflight (OPTIONS) requests through —
        # they never carry Authorization headers and are handled by CORS middleware.
        if request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"code": "auth_token_invalid", "message": "Missing authentication"},
            )

        token = auth_header.split(" ", 1)[1]
        payload = verify_token(token, token_type="access")
        if not payload:
            return JSONResponse(
                status_code=401,
                content={"code": "auth_token_expired", "message": "Token expired or invalid"},
            )

        # Inject into request state for downstream routes
        request.state.user_uid = payload["sub"]
        request.state.user_id = payload.get("user_id")

        return await call_next(request)


async def get_current_user_from_request(request: Request) -> dict:
    """Dependency for routes that need full user info (not just UID)."""
    from gateway.database import get_connection

    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT * FROM users WHERE uid = ?", (user_uid,))
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="User not found")

    return dict(row)
