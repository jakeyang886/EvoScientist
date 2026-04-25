"""SMTP email service — verification, password reset, and notifications."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

logger = logging.getLogger(__name__)


@dataclass
class EmailConfig:
    """SMTP email configuration."""
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    use_tls: bool = True
    sender_name: str = "EvoScientist"
    sender_email: str = ""
    base_url: str = "http://localhost:3065"

    @property
    def enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)


# Module-level config (set during gateway startup)
_config: EmailConfig | None = None


def set_email_config(cfg: EmailConfig) -> None:
    """Set the global email configuration."""
    global _config
    _config = cfg


def get_email_config() -> EmailConfig:
    """Get the current email configuration."""
    global _config
    if _config is None:
        _config = EmailConfig()
    return _config


# ─── Email Templates ────────────────────────────────────────────

def _verification_email_html(username: str, verify_url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">EvoScientist</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">验证您的邮箱</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#333333;">你好 {username}，</p>
            <p style="margin:0 0 24px;font-size:15px;color:#333333;">
              欢迎注册 EvoScientist！请点击下方按钮验证您的邮箱地址：
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:8px;">
                  <a href="{verify_url}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">验证邮箱</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#999999;text-align:center;">
              如果按钮无法点击，请复制以下链接到浏览器：
            </p>
            <p style="margin:0;font-size:12px;color:#999999;text-align:center;word-break:break-all;">
              {verify_url}
            </p>
            <p style="margin:24px 0 0;font-size:13px;color:#999999;">
              此链接将在 24 小时后过期。如果您没有注册 EvoScientist 账户，请忽略此邮件。
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:0 32px 32px;text-align:center;border-top:1px solid #eeeeee;">
            <p style="margin:16px 0 0;font-size:12px;color:#aaaaaa;">
              © EvoScientist. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _verification_email_text(username: str, verify_url: str) -> str:
    return f"""你好 {username}，

欢迎注册 EvoScientist！

请点击以下链接验证您的邮箱地址：
{verify_url}

此链接将在 24 小时后过期。
如果您没有注册 EvoScientist 账户，请忽略此邮件。

— EvoScientist
"""


def _reset_email_html(reset_url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">EvoScientist</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">重置密码</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 24px;font-size:15px;color:#333333;">
              我们收到了您的密码重置请求。请点击下方按钮设置新密码：
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:8px;">
                  <a href="{reset_url}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">重置密码</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#999999;text-align:center;">
              此链接将在 1 小时后过期。如果不是您本人操作，请忽略此邮件。
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;text-align:center;border-top:1px solid #eeeeee;">
            <p style="margin:16px 0 0;font-size:12px;color:#aaaaaa;">
              © EvoScientist. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _reset_email_text(reset_url: str) -> str:
    return f"""我们收到了您的密码重置请求。

请点击以下链接设置新密码：
{reset_url}

此链接将在 1 小时后过期。
如果不是您本人操作，请忽略此邮件。

— EvoScientist
"""


# ─── Send Email ─────────────────────────────────────────────────

async def send_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Send an email via SMTP. Returns True on success."""
    cfg = get_email_config()

    if not cfg.enabled:
        logger.info(
            "[EMAIL SIM] To: %s, Subject: %s\n%s",
            to_email, subject, text_body,
        )
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg.sender_name} <{cfg.sender_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        async with aiosmtplib.SMTP(
            hostname=cfg.smtp_host, 
            port=cfg.smtp_port, 
            use_tls=cfg.use_tls,
            timeout=10
        ) as smtp:
            await smtp.login(cfg.smtp_user, cfg.smtp_password)
            await smtp.send_message(msg)
            logger.info("Email sent successfully to %s", to_email)
            return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, str(e))
        return False


# ─── Convenience Functions ──────────────────────────────────────

async def send_verification_email(email: str, username: str, token: str) -> bool:
    """Send email verification email."""
    cfg = get_email_config()
    verify_url = f"{cfg.base_url}/verify-email?token={token}"
    html = _verification_email_html(username, verify_url)
    text = _verification_email_text(username, verify_url)
    return await send_email(email, "验证您的 EvoScientist 邮箱", html, text)


async def send_reset_email(email: str, token: str) -> bool:
    """Send password reset email."""
    cfg = get_email_config()
    reset_url = f"{cfg.base_url}/reset-password?token={token}"
    html = _reset_email_html(reset_url)
    text = _reset_email_text(reset_url)
    return await send_email(email, "重置您的 EvoScientist 密码", html, text)


async def send_resend_verification_email(email: str, username: str, token: str) -> bool:
    """Re-send verification email with a new token."""
    return await send_verification_email(email, username, token)
