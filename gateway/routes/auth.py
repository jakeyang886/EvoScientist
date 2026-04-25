"""Authentication routes — login, register, refresh, logout, me, password management."""

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from gateway.database import get_db
from gateway.models.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from gateway.utils.email import send_reset_email, send_verification_email
from gateway.utils.jwt import blacklist_token, create_token_pair, verify_token
from gateway.utils.password import hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _log_login(user_id: int, ip: str, ua: str, success: bool, reason: str = None):
    """Record a login attempt."""
    import asyncio

    from gateway.database import get_connection

    async def _log():
        conn = await get_connection()
        await conn.execute(
            """INSERT INTO login_logs (user_id, ip_address, user_agent, success, failure_reason)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, ip, ua, success, reason),
        )
        await conn.commit()

    asyncio.create_task(_log())


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """Authenticate user and return JWT token pair."""
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone(
        "SELECT * FROM users WHERE email = ?", (body.email,)
    )
    if not row:
        return JSONResponse(
            status_code=401,
            content={"code": "auth_login_failed", "message": "Invalid email or password"},
        )

    user = dict(row)

    # Check account status
    if user["status"] == "suspended":
        return JSONResponse(
            status_code=403,
            content={"code": "auth_account_locked", "message": "Account suspended"},
        )
    # Check email verification
    if user.get("email_verified") not in (1, True):
        return JSONResponse(
            status_code=403,
            content={"code": "auth_email_not_verified", "message": "Email not verified"},
        )

    # Check login failures
    failure_row = await conn.execute_fetchone(
        "SELECT * FROM login_failures WHERE user_id = ? AND locked_until > datetime('now')",
        (user["id"],),
    )
    if failure_row:
        return JSONResponse(
            status_code=403,
            content={
                "code": "auth_account_locked",
                "message": f"Account locked until {failure_row['locked_until']}",
            },
        )

    # Verify password
    if not verify_password(body.password, user["password"]):
        # Record failure
        await conn.execute(
            """INSERT INTO login_failures (user_id, ip_address, failure_count)
               VALUES (?, ?, 1)
               ON CONFLICT(user_id) DO UPDATE SET
                 failure_count = failure_count + 1,
                 updated_at = datetime('now'),
                 locked_until = CASE WHEN failure_count >= 4 THEN datetime('now', '+15 minutes') ELSE NULL END""",
            (user["id"], "unknown"),
        )
        await conn.commit()
        return JSONResponse(
            status_code=401,
            content={"code": "auth_login_failed", "message": "Invalid email or password"},
        )

    # Reset failure count on success
    await conn.execute(
        "DELETE FROM login_failures WHERE user_id = ?", (user["id"],)
    )
    await conn.commit()

    # Generate tokens
    tokens = create_token_pair(user["uid"], user["id"], remember=body.remember)

    # Log successful login
    _log_login(user["id"], "unknown", "unknown", True)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user={
            "uid": user["uid"],
            "username": user["username"],
            "email": user["email"],
        },
    )


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    """Create a new user account and return JWT token pair."""
    from gateway.database import get_connection

    conn = await get_connection()

    # Check uniqueness
    existing = await conn.execute_fetchone(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        (body.email, body.username),
    )
    if existing:
        return JSONResponse(
            status_code=409,
            content={"code": "validation_error", "message": "Email or username already exists"},
        )

    # Check invite code if required (optional feature)
    if body.invite_code:
        invite = await conn.execute_fetchone(
            "SELECT * FROM invite_codes WHERE code = ? AND uses < max_uses",
            (body.invite_code,),
        )
        if not invite:
            return JSONResponse(
                status_code=400,
                content={"code": "validation_error", "message": "Invalid or expired invite code"},
            )

    # Generate user UID (8-char hex)
    user_uid = uuid.uuid4().hex[:8]

    # Insert user
    password_hash = hash_password(body.password)
    cursor = await conn.execute(
        """INSERT INTO users (uid, username, email, password, plan, email_verified)
           VALUES (?, ?, ?, ?, 'starter', 0)""",
        (user_uid, body.username, body.email, password_hash),
    )
    await conn.commit()
    user_id = cursor.lastrowid

    # Generate email verification token
    verify_token = secrets.token_urlsafe(32)
    await conn.execute(
        """INSERT INTO email_verification_tokens (user_id, token, expires_at)
           VALUES (?, ?, datetime('now', '+24 hours'))""",
        (user_id, verify_token),
    )
    await conn.commit()

    # Log: send verification email
    try:
        await send_verification_email(body.email, body.username, verify_token)
    except Exception as e:
        logger.warning("Failed to send verification email: %s", str(e))

    # Generate tokens (user not verified yet, but can browse)
    tokens = create_token_pair(user_uid, user_id, remember=False)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user={
            "uid": user_uid,
            "username": body.username,
            "email": body.email,
        },
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest):
    """Refresh access token using a valid refresh token."""
    payload = verify_token(body.refresh_token, token_type="refresh")
    if not payload:
        return JSONResponse(
            status_code=401,
            content={"code": "auth_token_invalid", "message": "Invalid refresh token"},
        )

    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT * FROM users WHERE uid = ?", (payload["sub"],))
    if not row:
        return JSONResponse(
            status_code=401,
            content={"code": "auth_token_invalid", "message": "User not found"},
        )

    user = dict(row)
    tokens = create_token_pair(user["uid"], user["id"], remember=True)

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user={
            "uid": user["uid"],
            "username": user["username"],
            "email": user["email"],
        },
    )


@router.post("/logout")
async def logout(body: LogoutRequest):
    """Logout — add refresh token to blacklist."""
    await blacklist_token(body.refresh_token)
    return {}


@router.get("/me")
async def get_me(request: Request):
    """Get current user info — requires valid JWT (injected by middleware)."""
    from gateway.database import get_connection

    uid = getattr(request.state, "user_uid", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    conn = await get_connection()
    row = await conn.execute_fetchone(
        "SELECT uid, username, email, avatar_url, plan, status, email_verified FROM users WHERE uid = ?",
        (uid,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    user = dict(row)
    return {
        "uid": user["uid"],
        "username": user["username"],
        "email": user["email"],
        "avatar_url": user.get("avatar_url"),
        "plan": user.get("plan", "starter"),
        "status": user.get("status", "active"),
        "email_verified": bool(user.get("email_verified")),
    }


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Generate a password reset token (development: logs to console)."""
    from gateway.database import get_connection
    from gateway.utils.email import get_email_config

    conn = await get_connection()
    row = await conn.execute_fetchone(
        "SELECT * FROM users WHERE email = ?", (body.email,)
    )
    if not row:
        # Don't reveal if email exists
        return {}

    user = dict(row)
    reset_token = secrets.token_urlsafe(32)

    await conn.execute(
        """INSERT INTO password_reset_tokens (user_id, token, expires_at)
           VALUES (?, ?, datetime('now', '+1 hour'))""",
        (user["id"], reset_token),
    )
    await conn.commit()

    cfg = get_email_config()
    reset_url = f"{cfg.base_url}/reset-password?token={reset_token}"

    if not cfg.enabled:
        logger.info("Password reset link for %s: %s", body.email, reset_url)
        return {"reset_url": reset_url}

    await send_reset_email(body.email, reset_token)
    return {}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Reset password using a valid reset token."""
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone(
        """SELECT * FROM password_reset_tokens
           WHERE token = ? AND used = FALSE AND expires_at > datetime('now')""",
        (body.token,),
    )
    if not row:
        return JSONResponse(
            status_code=400,
            content={"code": "validation_error", "message": "Invalid or expired token"},
        )

    token_row = dict(row)
    password_hash = hash_password(body.new_password)

    await conn.execute(
        "UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?",
        (password_hash, token_row["user_id"]),
    )
    await conn.execute(
        "UPDATE password_reset_tokens SET used = TRUE WHERE id = ?",
        (token_row["id"],),
    )
    await conn.commit()

    return {}


async def _do_verify_email(token: str):
    """Shared verification logic used by both GET and POST handlers."""
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone(
        """SELECT * FROM email_verification_tokens
           WHERE token = ? AND used = FALSE AND expires_at > datetime('now')""",
        (token,),
    )
    if not row:
        return JSONResponse(
            status_code=400,
            content={"code": "validation_error", "message": "Invalid or expired token"},
        )

    token_row = dict(row)

    await conn.execute(
        "UPDATE users SET email_verified = TRUE, updated_at = datetime('now') WHERE id = ?",
        (token_row["user_id"],),
    )
    await conn.execute(
        "UPDATE email_verification_tokens SET used = TRUE WHERE id = ?",
        (token_row["id"],),
    )
    await conn.commit()

    return JSONResponse(content={"code": "email_verified", "message": "Email verified successfully"})


@router.get("/verify-email")
async def verify_email_get(token: str = ""):
    """Verify email via GET (for email link clicks)."""
    if not token:
        return JSONResponse(
            status_code=400,
            content={"code": "validation_error", "message": "Token is required"},
        )
    return await _do_verify_email(token)


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest):
    """Verify email using the verification token."""
    return await _do_verify_email(body.token)


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest):
    """Change password — requires valid JWT."""
    from fastapi import Request

    from gateway.database import get_connection
    from gateway.middleware.auth import get_current_user_from_request

    # This would normally use Depends(get_current_user)
    raise NotImplementedError("Use Depends(get_current_user) in protected routes")


@router.post("/resend-verification")
async def resend_verification(body: ForgotPasswordRequest):
    """Re-send verification email to the given address."""
    import secrets

    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone(
        "SELECT * FROM users WHERE email = ? AND email_verified = FALSE",
        (body.email,),
    )
    if not row:
        # Don't reveal if email exists or is already verified
        return {}

    user = dict(row)

    # Generate new verification token
    verify_token = secrets.token_urlsafe(32)
    await conn.execute(
        """INSERT INTO email_verification_tokens (user_id, token, expires_at)
           VALUES (?, ?, datetime('now', '+24 hours'))""",
        (user["id"], verify_token),
    )
    await conn.commit()

    await send_verification_email(body.email, user["username"], verify_token)
    return {}
