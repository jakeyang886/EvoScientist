"""Password utilities — bcrypt hashing and verification."""

from __future__ import annotations

import bcrypt


def hash_password(password: str, rounds: int = 12) -> str:
    """Hash a password with bcrypt.

    Args:
        password: Plain text password.
        rounds: Number of bcrypt rounds (default 12).

    Returns:
        Base64-encoded bcrypt hash string.
    """
    salt = bcrypt.gensalt(rounds=rounds)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash.

    Args:
        password: Plain text password to verify.
        hashed: Base64-encoded bcrypt hash string.

    Returns:
        True if password matches, False otherwise.
    """
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            hashed.encode("utf-8"),
        )
    except Exception:
        return False
