"""Admin authentication middleware — verify admin-scoped JWT for /api/admin/* routes."""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from gateway.utils.jwt import verify_token

logger = logging.getLogger(__name__)

# Paths that use admin auth (login/refresh/logout are skipped)
_ADMIN_AUTH_SKIP_PATHS = {"/api/admin/auth/login", "/api/admin/auth/refresh", "/api/admin/auth/logout"}


class AdminAuthMiddleware(BaseHTTPMiddleware):
    """Verify that requests to /api/admin/* carry an admin-scoped JWT.

    Must be mounted AFTER the regular AuthMiddleware so that
    request.state.user_uid is already populated.
    On success: injects request.state.admin_uid.
    """

    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only intercept /api/admin/* paths
        if not path.startswith("/api/admin/"):
            return await call_next(request)

        # Skip admin auth endpoints (they handle their own auth)
        if path in _ADMIN_AUTH_SKIP_PATHS:
            return await call_next(request)

        # Allow CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # The regular AuthMiddleware should have already verified the JWT
        # and injected user_uid. Re-read the token to check scope.
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

        if payload.get("scope") != "admin":
            return JSONResponse(
                status_code=403,
                content={"code": "ADMIN_REQUIRED", "message": "需要管理员权限"},
            )

        # Inject admin_uid for downstream use
        request.state.admin_uid = payload["sub"]

        return await call_next(request)
