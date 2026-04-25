"""Email service — development mode logs to console, production uses SMTP."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, body: str) -> None:
    """Send an email.

    Production: uses SMTP/SendGrid.
    Development: logs to console for easy debugging.
    """
    smtp_host = os.getenv("SMTP_HOST")
    if smtp_host:
        # TODO: Implement actual SMTP sending
        logger.warning("SMTP_HOST is set but SMTP sending is not yet implemented")
        return

    # Development mode: log the email content
    logger.info(
        "[EMAIL SIM] To: %s, Subject: %s\n%s",
        to,
        subject,
        body,
    )


async def send_verification_email(to: str, verification_url: str) -> None:
    """Send email verification link."""
    body = (
        f"Click the link below to verify your email address:\n\n"
        f"{verification_url}\n\n"
        f"If you did not create an account, please ignore this email."
    )
    await send_email(to, "Verify your EvoScientist email", body)


async def send_password_reset_email(to: str, reset_url: str) -> None:
    """Send password reset link."""
    body = (
        f"Click the link below to reset your password:\n\n"
        f"{reset_url}\n\n"
        f"This link expires in 1 hour.\n\n"
        f"If you did not request a password reset, please ignore this email."
    )
    await send_email(to, "Reset your EvoScientist password", body)
