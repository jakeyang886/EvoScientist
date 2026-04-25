"""Admin authentication routes — independent login/refresh for admin users."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from gateway.models.auth import LoginRequest, RefreshRequest, TokenResponse
from gateway.utils.jwt import create_token_pair, verify_token, blacklist_token
from gateway.utils.password import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


@router.post("/login", response_model=TokenResponse)
async def admin_login(body: LoginRequest):
    """Admin login — authenticates against the admins table."""
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone(
        "SELECT * FROM admins WHERE email = ?", (body.email,)
    )
    if not row:
        return JSONResponse(
            status_code=401,
            content={"code": "auth_login_failed", "message": "Invalid email or password"},
        )

    admin = dict(row)

    if admin["status"] != "active":
        return JSONResponse(
            status_code=403,
            content={"code": "auth_account_locked", "message": "Account disabled"},
        )

    if not verify_password(body.password, admin["password"]):
        return JSONResponse(
            status_code=401,
            content={"code": "auth_login_failed", "message": "Invalid email or password"},
        )

    tokens = create_token_pair(
        admin["uid"], admin["id"], remember=body.remember, scope="admin"
    )
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user={"uid": admin["uid"], "username": admin["username"], "email": admin["email"]},
    )


@router.post("/refresh", response_model=TokenResponse)
async def admin_refresh(body: RefreshRequest):
    """Refresh admin token — only accepts admin-scoped refresh tokens."""
    payload = verify_token(body.refresh_token, token_type="refresh")
    if not payload:
        return JSONResponse(
            status_code=401,
            content={"code": "auth_token_expired", "message": "Invalid or expired refresh token"},
        )

    if payload.get("scope") != "admin":
        return JSONResponse(
            status_code=403,
            content={"code": "auth_forbidden", "message": "Not an admin token"},
        )

    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone(
        "SELECT uid, username, email, status FROM admins WHERE uid = ?",
        (payload["sub"],),
    )
    if not row or row["status"] != "active":
        return JSONResponse(
            status_code=401,
            content={"code": "auth_account_locked", "message": "Admin account disabled"},
        )

    # Blacklist old refresh token
    await blacklist_token(body.refresh_token)

    tokens = create_token_pair(row["uid"], 0, scope="admin")
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user={"uid": row["uid"], "username": row["username"], "email": row["email"]},
    )


@router.post("/logout")
async def admin_logout(body: RefreshRequest):
    """Admin logout — blacklists the refresh token."""
    await blacklist_token(body.refresh_token)
    return {"message": "Logged out"}
