"""Gateway configuration — dataclass for settings that override or extend CLI config."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_model_pricing() -> dict[str, dict[str, float]]:
    """Load model_pricing from config.yaml."""
    try:
        import yaml
        config_path = Path(
            os.environ.get(
                "EVOSCIENTIST_CONFIG_DIR",
                Path.home() / ".config" / "evoscientist",
            )
        ) / "config.yaml"
        if not config_path.exists():
            return {"default": {"input_multiplier": 1.0, "output_multiplier": 1.0}}
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        pricing = data.get("model_pricing", {})
        if "default" not in pricing:
            pricing["default"] = {"input_multiplier": 1.0, "output_multiplier": 1.0}
        return pricing
    except Exception:
        return {"default": {"input_multiplier": 1.0, "output_multiplier": 1.0}}


@dataclass
class GatewayConfig:
    """Settings specific to the Gateway layer.

    All values can be overridden by environment variables.
    """

    host: str = "0.0.0.0"
    port: int = 8065
    secret: str = ""
    database_url: str = ""
    gateway_db_url: str = ""
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:3065"])
    access_token_expiry: str = "24h"
    refresh_token_expiry: str = "30d"
    max_upload_size: int = 25 * 1024 * 1024  # 25 MB
    sse_heartbeat_interval: int = 15  # seconds
    sse_timeout: int = 600  # seconds
    hitl_timeout: int = 300  # seconds
    workers: int = 1  # G21: forced to 1 (ThreadRegistry/RateLimiter are in-process)

    # Email / SMTP settings
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    sender_name: str = "EvoScientist"
    sender_email: str = ""
    base_url: str = "http://localhost:3065"

    # Thread concurrency limits
    thread_limit_starter: int = 1
    thread_limit_pro: int = 3
    thread_limit_max: int = 5
    thread_limit_ultra: int = 10

    # Rate limiting (configured via pricing.json — no longer hardcoded)
    # Legacy env vars RATE_LIMIT_PER_MINUTE / RATE_LIMIT_PER_DAY are ignored

    # Billing
    billing_starter_initial_tokens: int = 100_000
    billing_starter_price_per_million: float = 50.0
    billing_pro_monthly_price: float = 99.0
    billing_pro_default_days: int = 30
    billing_max_monthly_price: float = 199.0
    billing_max_default_days: int = 30
    billing_ultra_monthly_price: float = 399.0
    billing_ultra_default_days: int = 30

    # Model pricing multipliers
    model_pricing: dict[str, dict[str, float]] = field(
        default_factory=lambda: {"default": {"input_multiplier": 1.0, "output_multiplier": 1.0}}
    )

    # Admin API rate limit
    admin_rate_limit_per_minute: int = 60

    # Initial admin emails (comma-separated env var)
    admin_emails: list[str] = field(default_factory=list)

    # ThreadRegistry TTL
    thread_entry_ttl_minutes: int = 30

    # System timezone (IANA timezone name, e.g. "Asia/Shanghai", "UTC")
    # Used for token usage daily aggregation to align with user's business day
    timezone: str = "UTC"

    @property
    def thread_limits(self) -> dict[str, int]:
        return {
            "starter": self.thread_limit_starter,
            "pro": self.thread_limit_pro,
            "max": self.thread_limit_max,
            "ultra": self.thread_limit_ultra,
        }

    @property
    def billing_plans(self) -> dict:
        return {
            "starter": {
                "initial_tokens": self.billing_starter_initial_tokens,
                "price_per_million": self.billing_starter_price_per_million,
            },
            "pro": {
                "monthly_price": self.billing_pro_monthly_price,
                "default_days": self.billing_pro_default_days,
            },
            "max": {
                "monthly_price": self.billing_max_monthly_price,
                "default_days": self.billing_max_default_days,
            },
            "ultra": {
                "monthly_price": self.billing_ultra_monthly_price,
                "default_days": self.billing_ultra_default_days,
            },
        }

    def get_model_pricing(self, model: str) -> dict[str, float]:
        return self.model_pricing.get(
            model,
            self.model_pricing.get("default", {"input_multiplier": 1.0, "output_multiplier": 1.0}),
        )

    @classmethod
    def from_env(cls) -> GatewayConfig:
        """Build config from environment variables with sensible defaults."""
        from EvoScientist.config.settings import get_config_dir
        config_dir = get_config_dir()

        return cls(
            host=os.getenv("GATEWAY_HOST", "0.0.0.0"),
            port=int(os.getenv("GATEWAY_PORT", "8065")),
            secret=os.getenv("GATEWAY_SECRET", ""),
            database_url=os.getenv("DATABASE_URL", str(config_dir / "sessions.db")),
            gateway_db_url=os.getenv("GATEWAY_DB_URL", str(config_dir / "gateway.db")),
            cors_origins=[
                o.strip()
                for o in os.getenv("CORS_ORIGINS", "http://localhost:3065").split(",")
            ],
            access_token_expiry=os.getenv("ACCESS_TOKEN_EXPIRY", "24h"),
            refresh_token_expiry=os.getenv("REFRESH_TOKEN_EXPIRY", "30d"),
            max_upload_size=int(os.getenv("MAX_UPLOAD_SIZE", str(25 * 1024 * 1024))),
            sse_heartbeat_interval=int(os.getenv("SSE_HEARTBEAT_INTERVAL", "15")),
            sse_timeout=int(os.getenv("SSE_TIMEOUT", "600")),
            hitl_timeout=int(os.getenv("HITL_TIMEOUT", "300")),
            workers=int(os.getenv("WORKERS", "1")),
            smtp_host=os.getenv("SMTP_HOST", ""),
            smtp_port=int(os.getenv("SMTP_PORT", "465")),
            smtp_user=os.getenv("SMTP_USER", ""),
            smtp_password=os.getenv("SMTP_PASSWORD", ""),
            smtp_use_tls=os.getenv("SMTP_USE_TLS", "true").lower() != "false",
            sender_name=os.getenv("SMTP_SENDER_NAME", "EvoScientist"),
            sender_email=os.getenv("SMTP_SENDER_EMAIL", ""),
            base_url=os.getenv("BASE_URL", "http://localhost:3065"),
            thread_limit_starter=int(os.getenv("THREAD_LIMIT_STARTER", "1")),
            thread_limit_pro=int(os.getenv("THREAD_LIMIT_PRO", "3")),
            thread_limit_max=int(os.getenv("THREAD_LIMIT_MAX", "5")),
            thread_limit_ultra=int(os.getenv("THREAD_LIMIT_ULTRA", "10")),
            # Rate limit values come from pricing.json, not env vars
            billing_starter_initial_tokens=int(os.getenv("BILLING_STARTER_INITIAL_TOKENS", "100000")),
            billing_starter_price_per_million=float(os.getenv("BILLING_STARTER_PRICE_PER_MILLION", "50.0")),
            billing_pro_monthly_price=float(os.getenv("BILLING_PRO_MONTHLY_PRICE", "99.0")),
            billing_pro_default_days=int(os.getenv("BILLING_PRO_DEFAULT_DAYS", "30")),
            billing_max_monthly_price=float(os.getenv("BILLING_MAX_MONTHLY_PRICE", "199.0")),
            billing_max_default_days=int(os.getenv("BILLING_MAX_DEFAULT_DAYS", "30")),
            billing_ultra_monthly_price=float(os.getenv("BILLING_ULTRA_MONTHLY_PRICE", "399.0")),
            billing_ultra_default_days=int(os.getenv("BILLING_ULTRA_DEFAULT_DAYS", "30")),
            model_pricing=_load_model_pricing(),
            admin_rate_limit_per_minute=int(os.getenv("ADMIN_RATE_LIMIT_PER_MINUTE", "60")),
            admin_emails=[
                e.strip()
                for e in os.getenv("EVO_ADMIN_EMAILS", "").split(",")
                if e.strip()
            ],
            thread_entry_ttl_minutes=int(os.getenv("THREAD_ENTRY_TTL_MINUTES", "30")),
            timezone=_load_timezone_from_settings() or os.getenv("GATEWAY_TIMEZONE", "UTC"),
        )

    def validate(self) -> list[str]:
        """Return a list of validation errors (empty = all good)."""
        errors: list[str] = []
        if not self.secret or len(self.secret) < 32:
            errors.append("GATEWAY_SECRET must be at least 32 characters")
        if self.port < 1 or self.port > 65535:
            errors.append(f"GATEWAY_PORT must be 1-65535, got {self.port}")
        return errors


# Module-level singleton — created once at import time
_gateway_config: GatewayConfig | None = None


def get_gateway_config() -> GatewayConfig:
    """Return the cached GatewayConfig (creates on first call)."""
    global _gateway_config
    if _gateway_config is None:
        _gateway_config = GatewayConfig.from_env()
    return _gateway_config


def reset_gateway_config() -> None:
    """Reset the cached config (useful for testing)."""
    global _gateway_config
    _gateway_config = None


def get_tz_aware_date() -> str:
    """Return today's date in the configured timezone as ISO string (YYYY-MM-DD).

    This ensures token_usage.date aligns with the user's business day
    rather than raw UTC, which may split a day at 8am local time.
    """
    from datetime import datetime
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(get_gateway_config().timezone)
        return datetime.now(tz).date().isoformat()
    except Exception:
        # Fallback to UTC if timezone is invalid
        from datetime import timezone as _tz
        return datetime.now(_tz.utc).date().isoformat()


def get_tz_offset_hours() -> int:
    """Return the UTC offset in hours for the configured timezone.

    Used by SQLite queries that need to shift CURRENT_TIMESTAMP.
    """
    from datetime import datetime
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(get_gateway_config().timezone)
        utc_offset = datetime.now(tz).utcoffset()
        if utc_offset:
            return int(utc_offset.total_seconds() / 3600)
    except Exception:
        pass
    return 0


def tz_date_expr(column: str = "'now'", op: str = "") -> str:
    """Return a SQLite date expression adjusted for the configured timezone.

    Examples:
        tz_date_expr()             → "date('now', '+8 hours')"
        tz_date_expr("created_at") → "date(created_at, '+8 hours')"
        tz_date_expr("created_at", "-6 days") → "date(created_at, '-6 days', '+8 hours')"
    """
    offset = get_tz_offset_hours()
    offset_str = f", '{offset:+d} hours'" if offset != 0 else ""
    if op:
        return f"date({column}, '{op}'{offset_str})"
    return f"date({column}{offset_str})"


def tz_today_expr() -> str:
    """Return a SQLite expression for 'today in configured timezone'.

    For UTC+8: "date('now', '+8 hours')"
    For UTC:   "date('now')"
    """
    return tz_date_expr()


def set_gateway_timezone(tz_name: str) -> bool:
    """Update the timezone in the cached config and persist to settings file.

    Returns True if valid timezone name.
    """
    try:
        import zoneinfo
        zoneinfo.ZoneInfo(tz_name)  # validate
    except Exception:
        return False
    cfg = get_gateway_config()
    cfg.timezone = tz_name

    # Persist to settings.json so it survives restarts
    try:
        import json
        from EvoScientist.config.settings import get_config_dir
        settings_path = get_config_dir() / "settings.json"
        settings = {}
        if settings_path.exists():
            settings = json.loads(settings_path.read_text())
        settings["timezone"] = tz_name
        settings_path.write_text(json.dumps(settings, indent=2))
    except Exception:
        pass  # Best-effort persistence; in-memory update is still active
    return True


def _load_timezone_from_settings() -> str:
    """Load timezone from settings.json if available."""
    try:
        import json
        from EvoScientist.config.settings import get_config_dir
        settings_path = get_config_dir() / "settings.json"
        if settings_path.exists():
            settings = json.loads(settings_path.read_text())
            tz = settings.get("timezone")
            if tz:
                import zoneinfo
                zoneinfo.ZoneInfo(tz)  # validate
                return tz
    except Exception:
        pass
    return ""
