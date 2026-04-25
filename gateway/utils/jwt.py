"""JWT utilities — token creation, verification, and blacklist."""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# Module-level cache for blacklisted token hashes
_blacklist_cache: set[str] = set()


def _get_secret() -> str:
    secret = os.getenv("GATEWAY_SECRET")
    if not secret:
        raise RuntimeError("GATEWAY_SECRET environment variable is not set")
    return secret


def _parse_expiry(expiry_str: str) -> timedelta:
    """Parse expiry string like '24h', '30d', '7d'."""
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    value = int(expiry_str[:-1])
    unit = expiry_str[-1].lower()
    if unit not in units:
        raise ValueError(f"Unknown expiry unit: {unit}")
    return timedelta(seconds=value * units[unit])


def create_token_pair(user_uid: str, user_id: int, remember: bool = False, scope: str = "user") -> dict:
    """Create access + refresh token pair.

    Uses simple JWT-like structure (HMAC-SHA256) without external dependency.
    In production, use PyJWT or python-jose.

    Args:
        user_uid: User or admin unique identifier.
        user_id: Numeric row ID (0 for admins).
        remember: Extend refresh token lifetime.
        scope: "user" or "admin" — determines token scope.
    """
    import base64
    import hmac
    import json

    secret = _get_secret()
    now = datetime.now(timezone.utc)

    # Access token: 24h
    access_expiry = now + _parse_expiry(os.getenv("ACCESS_TOKEN_EXPIRY", "24h"))
    access_payload = json.dumps({
        "sub": user_uid,
        "user_id": user_id,
        "type": "access",
        "scope": scope,
        "iat": now.isoformat(),
        "exp": access_expiry.isoformat(),
    })
    access_token = _sign_token(access_payload, secret)

    # Refresh token: 30d (or longer if remember is set)
    refresh_expiry_str = os.getenv("REFRESH_TOKEN_EXPIRY", "30d")
    refresh_expiry = now + _parse_expiry(refresh_expiry_str)
    refresh_payload = json.dumps({
        "sub": user_uid,
        "user_id": user_id,
        "type": "refresh",
        "scope": scope,
        "iat": now.isoformat(),
        "exp": refresh_expiry.isoformat(),
    })
    refresh_token = _sign_token(refresh_payload, secret)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": int(access_expiry.timestamp()),
    }


def _sign_token(payload: str, secret: str) -> str:
    """Sign a payload with HMAC-SHA256 and return base64-encoded token."""
    import base64
    import hmac

    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    signature = hmac.new(
        secret.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{payload_b64}.{sig_b64}"


def verify_token(token: str, token_type: str = "access") -> dict | None:
    """Verify a token and return its payload, or None if invalid/expired/blacklisted."""
    import base64
    import hmac
    import json

    secret = _get_secret()

    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        return None

    # Check blacklist
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if token_hash in _blacklist_cache:
        return None

    # Verify signature
    expected_sig = hmac.new(
        secret.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).digest()
    expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")
    if sig_b64 != expected_sig_b64:
        return None

    # Decode payload
    try:
        # Add padding
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_json = base64.urlsafe_b64decode(payload_b64).decode()
        payload = json.loads(payload_json)
    except Exception:
        return None

    # Check type
    if payload.get("type") != token_type:
        return None

    # Check expiry
    exp_str = payload.get("exp")
    if exp_str:
        exp = datetime.fromisoformat(exp_str)
        if exp < datetime.now(timezone.utc):
            return None

    return payload


async def blacklist_token(token: str) -> None:
    """Add a token to the blacklist (for logout)."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    _blacklist_cache.add(token_hash)

    # Also persist to DB
    from datetime import datetime, timedelta

    from gateway.database import get_connection
    try:
        conn = await get_connection()
        await conn.execute(
            "INSERT OR IGNORE INTO jwt_blacklist (token_hash, expires_at) VALUES (?, ?)",
            (token_hash, (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()),
        )
        await conn.commit()
    except Exception as e:
        logger.warning("Failed to persist token blacklist: %s", e)
