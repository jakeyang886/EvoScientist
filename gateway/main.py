"""EvoScientist Gateway — FastAPI application entry point."""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

logger = logging.getLogger(__name__)

load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gateway.database import close_gateway_db, get_connection, init_gateway_db
from gateway.middleware.auth import AuthMiddleware
from gateway.middleware.admin_auth import AdminAuthMiddleware
from gateway.routes import auth, endpoint_stats, global_uploads, hitl, models, threads, uploads, users
from gateway.routes.admin import router as admin_router
from gateway.routes.admin_auth import router as admin_auth_router
from gateway.routes.files import router as files_router

# Global shutdown flag
_shutting_down = False


# =============================================================================
# Lifespan
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup → yield → shutdown."""
    # --- Startup ---
    # 1. Ensure config directory exists (~/.config/evoscientist/)
    from EvoScientist.config.settings import get_config_dir
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)

    # 2. Load CLI config and apply to environment variables
    from EvoScientist.config.settings import (
        apply_config_to_env,
        get_config_path,
        get_effective_config,
    )

    config_path = get_config_path()
    print(f"📂 Config Path: {config_path} (Exists: {config_path.exists()})", file=sys.stderr)

    cli_config = get_effective_config()
    apply_config_to_env(cli_config)

    print(f"⚙️ Loaded Config -> Provider: {cli_config.provider}, Model: {cli_config.model}", file=sys.stderr)
    print(f"🔑 Env MINIMAX_API_KEY: {'SET' if os.getenv('MINIMAX_API_KEY') else 'MISSING'}", file=sys.stderr)

    # Log available models based on current config
    from gateway.routes.models import _build_model_list
    available_models, resolved_default = _build_model_list(preferred_default=cli_config.model)
    if available_models:
        print(f"🤖 Available Models ({len(available_models)}): {', '.join([m.id for m in available_models])}", file=sys.stderr)
        print(f"⚡ Default Model: {resolved_default}", file=sys.stderr)
    else:
        print("⚠️ No models available! Check API keys.", file=sys.stderr)

    # 3. Initialize gateway.db (creates tables + runs migrations)
    await init_gateway_db()

    # 4. Gateway config
    from gateway.config import get_gateway_config
    cfg = get_gateway_config()

    # 4a. Force single-worker [G21]
    if cfg.workers > 1:
        logger.warning(
            "workers=%d ignored, forcing workers=1 (ThreadRegistry/RateLimiter are in-process state)",
            cfg.workers,
        )
        cfg.workers = 1

    # 5. ThreadRegistry startup cleanup [G3] — apply config TTL
    from datetime import timedelta

    from gateway.services.thread_registry import ENTRY_TTL as _DEFAULT_TTL
    from gateway.services.thread_registry import thread_registry
    configured_ttl = timedelta(minutes=cfg.thread_entry_ttl_minutes) if cfg.thread_entry_ttl_minutes != 30 else None
    if configured_ttl:
        thread_registry._ttl = configured_ttl
    await thread_registry.startup_cleanup()

    # 6. RateLimiter init + cold start [G2]
    from gateway.services.rate_limiter import init_rate_limiter, init_request_rate_limiter
    rl = init_rate_limiter()
    db = await get_connection()
    await rl.cold_start_from_db(db)

    # 6a. Pricing config
    from gateway.pricing_config import get_pricing_config
    pricing_cfg = get_pricing_config()
    print(f"💰 Pricing Config loaded (version={pricing_cfg.version}, "
          f"price/M={pricing_cfg.token_pricing.price_per_million_tokens} {pricing_cfg.token_pricing.currency})",
          file=sys.stderr)

    # 6b. RequestRateLimiter init + cold start
    req_rl = init_request_rate_limiter()
    await req_rl.cold_start_from_db(db)

    # 6c. EndpointStats restore today from DB
    try:
        from EvoScientist.config.model_config import get_endpoint_stats
        await get_endpoint_stats().restore_today_from_db()
    except Exception:
        logger.warning("EndpointStats restore from DB failed", exc_info=True)

    # 7. Initial admin emails [G6]
    if cfg.admin_emails:
        await _ensure_admin_emails(cfg.admin_emails)

    # 8. TTL cleanup background task [G3]
    _cleanup_task = asyncio.create_task(_ttl_cleanup_loop())

    # 9. Email service
    from gateway.utils.email import EmailConfig, set_email_config
    email_cfg = EmailConfig(
        smtp_host=cfg.smtp_host,
        smtp_port=cfg.smtp_port,
        smtp_user=cfg.smtp_user,
        smtp_password=cfg.smtp_password,
        use_tls=cfg.smtp_use_tls,
        sender_name=cfg.sender_name,
        sender_email=cfg.sender_email,
        base_url=cfg.base_url,
    )
    set_email_config(email_cfg)

    # Log startup — rate limits come from pricing.json per-plan
    try:
        from gateway.pricing_config import get_plan_config
        _s = get_plan_config("starter")["rate_limits"]
        logger.info(
            "gateway_started port=%d rate_limits(starter)=%s/min, %s/day",
            cfg.port, _s.get("tokens_per_minute"), _s.get("tokens_per_day"),
        )
    except Exception:
        logger.info("gateway_started port=%d rate_limits=pricing.json", cfg.port)

    yield

    # --- Shutdown [G29] ---
    global _shutting_down
    _shutting_down = True
    logger.info("gateway_shutting_down")

    _cleanup_task.cancel()

    # Wait for active SSE streams (max 30s)
    deadline = asyncio.get_event_loop().time() + 30
    while thread_registry._entries and asyncio.get_event_loop().time() < deadline:
        logger.info("waiting_for_streams active=%d", len(thread_registry._entries))
        await asyncio.sleep(2)

    if thread_registry._entries:
        remaining = list(thread_registry._entries.keys())
        logger.warning("force_cleanup_on_shutdown threads=%s", remaining)
        for tid in remaining:
            await thread_registry.unregister(tid)

    await close_gateway_db()
    logger.info("gateway_shutdown_complete")


async def _ensure_admin_emails(emails: list[str]) -> None:
    """Ensure admin accounts exist in the admins table for configured emails."""
    import uuid
    from gateway.utils.password import hash_password

    db = await get_connection()
    for email in emails:
        # Check if admin already exists
        existing = await db.execute_fetchone(
            "SELECT id FROM admins WHERE email = ?", (email,)
        )
        if existing:
            continue

        # Check if there's a matching user to copy credentials from
        user_row = await db.execute_fetchone(
            "SELECT uid, username, password FROM users WHERE email = ?", (email,)
        )
        if user_row:
            await db.execute(
                """INSERT OR IGNORE INTO admins (uid, username, email, password, status)
                   VALUES (?, ?, ?, ?, 'active')""",
                (user_row["uid"], user_row["username"], email, user_row["password"]),
            )
        else:
            # Create a placeholder admin (password must be set via CLI)
            uid = uuid.uuid4().hex[:8]
            placeholder_pw = hash_password(uuid.uuid4().hex)
            await db.execute(
                """INSERT OR IGNORE INTO admins (uid, username, email, password, status)
                   VALUES (?, ?, ?, ?, 'active')""",
                (uid, email.split("@")[0], email, placeholder_pw),
            )
            logger.warning(
                "Created placeholder admin for %s — set password via: evo-admin reset-password --email %s",
                email, email,
            )
    await db.commit()


async def _ttl_cleanup_loop() -> None:
    from gateway.services.rate_limiter import rate_limiter
    from gateway.services.thread_registry import thread_registry

    while True:
        await asyncio.sleep(300)
        try:
            count = await thread_registry.cleanup_expired()
            if count:
                logger.info("ttl_cleanup removed=%d", count)
            if rate_limiter:
                cleaned = await rate_limiter.cleanup_stale_counters()
                if cleaned:
                    logger.debug("rate_limiter_cleanup cleaned=%d", cleaned)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("ttl_cleanup error: %s", e)


# =============================================================================
# App Factory
# =============================================================================

app = FastAPI(
    title="EvoScientist Gateway",
    version="0.2.0",
    description="Thin Gateway for EvoScientist CLI + Web — authenticates, routes, "
                "and streams SSE events from the CLI Agent Core.",
    lifespan=lifespan,
)

# =============================================================================
# Middleware (registered in order)
# =============================================================================

# CORS — restrict to frontend origin
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3065").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication — skip paths that don't require JWT
app.add_middleware(AuthMiddleware, skip_paths=[
    "/health",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email",
    "/api/auth/resend-verification",
    "/api/admin/auth/login",
    "/api/admin/auth/refresh",
])

# Admin auth — verify admin scope for /api/admin/* routes (after AuthMiddleware)
app.add_middleware(AdminAuthMiddleware)

# =============================================================================
# Routes
# =============================================================================

app.include_router(auth.router)
app.include_router(threads.router)
app.include_router(uploads.router)
app.include_router(global_uploads.router)
app.include_router(files_router)
app.include_router(hitl.router)
app.include_router(models.router)
app.include_router(users.router)
app.include_router(admin_auth_router)
app.include_router(admin_router)
app.include_router(endpoint_stats.router)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health")
async def health() -> JSONResponse:
    """Health check endpoint — no authentication required."""
    import time
    return JSONResponse(content={
        "status": "healthy",
        "database": "connected",
        "version": "0.2.0",
        "uptime": time.time(),
    })
