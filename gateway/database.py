"""Gateway database — aiosqlite connection management for gateway.db."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite


# Monkey-patch aiosqlite.Connection to add execute_fetchone
async def _execute_fetchone(self, sql, params=()):
    cursor = await self.execute(sql, params)
    return await cursor.fetchone()

aiosqlite.Connection.execute_fetchone = _execute_fetchone

# Monkey-patch aiosqlite.Connection to add execute_fetchall
async def _execute_fetchall(self, sql, params=()):
    cursor = await self.execute(sql, params)
    return await cursor.fetchall()

aiosqlite.Connection.execute_fetchall = _execute_fetchall

logger = logging.getLogger(__name__)

# Module-level connection pool (single connection for SQLite is fine)
_db_path: Path | None = None
_connection: aiosqlite.Connection | None = None


def _resolve_db_path() -> Path:
    """Resolve gateway.db path from config or default."""
    import os
    env_path = os.getenv("GATEWAY_DB_URL")
    if env_path:
        return Path(env_path).expanduser()
    # Default: same directory as sessions.db
    from EvoScientist.config.settings import get_config_dir
    return get_config_dir() / "gateway.db"


# =============================================================================
# Schema
# =============================================================================

SCHEMA_STATEMENTS: list[str] = [
    # Schema versioning
    """
    CREATE TABLE IF NOT EXISTS _schema_version (
        version     INTEGER PRIMARY KEY,
        applied_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        description TEXT
    )
    """,
    # Users
    """
    CREATE TABLE IF NOT EXISTS users (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        uid             TEXT UNIQUE NOT NULL,
        username        TEXT UNIQUE NOT NULL,
        email           TEXT UNIQUE NOT NULL,
        password        TEXT NOT NULL,
        avatar_url      TEXT,
        plan            TEXT DEFAULT 'starter',
        status          TEXT DEFAULT 'active',
        role            TEXT DEFAULT 'user' NOT NULL,
        email_verified  BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Token usage (per user per thread per model per turn)
    """
    CREATE TABLE IF NOT EXISTS token_usage (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        date            DATE NOT NULL,
        input_tokens    INTEGER DEFAULT 0,
        output_tokens   INTEGER DEFAULT 0,
        message_count   INTEGER DEFAULT 0,
        model           TEXT,
        thread_id       TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date, model, thread_id)
    )
    """,
    # Token usage detail log (every API call)
    """
    CREATE TABLE IF NOT EXISTS token_usage_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        thread_id       TEXT,
        model           TEXT,
        input_tokens    INTEGER DEFAULT 0,
        output_tokens   INTEGER DEFAULT 0,
        total_tokens    INTEGER DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Login logs
    """
    CREATE TABLE IF NOT EXISTS login_logs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        ip_address      TEXT,
        user_agent      TEXT,
        device_name     TEXT,
        success         BOOLEAN,
        failure_reason  TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Login failures
    """
    CREATE TABLE IF NOT EXISTS login_failures (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        ip_address      TEXT,
        failure_count   INTEGER DEFAULT 1,
        locked_until    TIMESTAMP,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
    )
    """,
    # Email verification tokens
    """
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id),
        token       TEXT UNIQUE NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        used        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Password reset tokens
    """
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id),
        token       TEXT UNIQUE NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        used        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # JWT blacklist
    """
    CREATE TABLE IF NOT EXISTS jwt_blacklist (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash  TEXT UNIQUE NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # User devices
    """
    CREATE TABLE IF NOT EXISTS user_devices (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        device_name     TEXT NOT NULL,
        ip_address      TEXT,
        user_agent      TEXT,
        refresh_token_hash TEXT,
        last_seen       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active       BOOLEAN DEFAULT TRUE
    )
    """,
    # Invite codes
    """
    CREATE TABLE IF NOT EXISTS invite_codes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        code            TEXT UNIQUE NOT NULL,
        created_by      INTEGER REFERENCES users(id),
        uses            INTEGER DEFAULT 0,
        max_uses        INTEGER DEFAULT 1,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Account deletions
    """
    CREATE TABLE IF NOT EXISTS account_deletions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        status          TEXT DEFAULT 'pending',
        requested_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at    TIMESTAMP
    )
    """,
    # User balances / subscriptions
    """
    CREATE TABLE IF NOT EXISTS user_balances (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id                 INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_balance           INTEGER DEFAULT 0,
        total_consumed          INTEGER DEFAULT 0,
        plan                    TEXT DEFAULT 'starter',
        plan_expires_at         TEXT,
        starter_token_snapshot  INTEGER DEFAULT 0,
        created_at              TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at              TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
    """,
    # Admin users (separate from regular users)
    """
    CREATE TABLE IF NOT EXISTS admins (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        uid         TEXT UNIQUE NOT NULL,
        username    TEXT UNIQUE NOT NULL,
        email       TEXT UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        status      TEXT DEFAULT 'active',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # Recharge records
    """
    CREATE TABLE IF NOT EXISTS recharge_records (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operator_id     INTEGER REFERENCES users(id),
        admin_uid       TEXT,
        type            TEXT NOT NULL,
        amount          INTEGER NOT NULL,
        balance_before  TEXT,
        balance_after   TEXT,
        remark          TEXT,
        created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
    """,
    # User suggestions / feedback
    """
    CREATE TABLE IF NOT EXISTS suggestions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title           TEXT NOT NULL,
        content         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'open',
        created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS suggestion_attachments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_id   INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
        filename        TEXT NOT NULL,
        stored_name     TEXT NOT NULL,
        mime_type       TEXT,
        size            INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
    """,
    # Indexes
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    "CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_user_date ON token_usage(user_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_thread ON token_usage(thread_id)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_log_user ON token_usage_log(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_token_usage_log_thread ON token_usage_log(thread_id)",
    "CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_login_failures_user ON login_failures(user_id)",
    # Ensure user_id uniqueness for ON CONFLICT in login route
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_login_failures_user_id ON login_failures(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_expires ON jwt_blacklist(expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code)",
    # Billing indexes
    "CREATE INDEX IF NOT EXISTS idx_user_balances_user ON user_balances(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_balances_plan ON user_balances(plan)",
    "CREATE INDEX IF NOT EXISTS idx_recharge_records_user ON recharge_records(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_recharge_records_operator ON recharge_records(operator_id)",
    "CREATE INDEX IF NOT EXISTS idx_suggestions_user_created ON suggestions(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_suggestion_attachments_suggestion ON suggestion_attachments(suggestion_id)",
    "CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)",
    "CREATE INDEX IF NOT EXISTS idx_admins_uid ON admins(uid)",
]


# =============================================================================
# Public API
# =============================================================================

async def init_gateway_db() -> None:
    """Initialize gateway.db: create tables and indexes if they don't exist."""
    global _db_path, _connection

    _db_path = _resolve_db_path()
    _db_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Initializing gateway.db at %s", _db_path)

    _connection = await aiosqlite.connect(str(_db_path))
    _connection.row_factory = aiosqlite.Row

    # Enable WAL mode
    await _connection.execute("PRAGMA journal_mode=WAL")
    await _connection.execute("PRAGMA busy_timeout=5000")

    # Create all tables
    for stmt in SCHEMA_STATEMENTS:
        await _connection.execute(stmt)
    await _connection.commit()

    # ── Versioned Migrations ───────────────────────────────────
    await _run_migrations(_connection)

    logger.info("gateway.db initialized successfully")


# =============================================================================
# Versioned Migrations
# =============================================================================

_MIGRATIONS: dict[int, tuple[str, str]] = {
    1: ("V1", "initial schema — user_balances, recharge_records, _schema_version created via SCHEMA_STATEMENTS"),
    2: ("V2", "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' NOT NULL"),
    3: ("V3", "Migrate plan values: free→starter, enterprise→ultra"),
    4: ("V4", "ALTER TABLE token_usage_log ADD COLUMN billed_tokens / total_tokens / is_estimated"),
    5: ("V5", "token_usage UNIQUE constraint migration: (user_id, date, model) → (user_id, date, model, thread_id)"),
    6: ("V6", "ALTER TABLE jwt_blacklist ADD COLUMN token_hash TEXT (idempotent)"),
    7: ("V7", "ALTER TABLE user_devices ADD COLUMN refresh_token_hash TEXT / is_active INTEGER (idempotent)"),
    8: ("V8", "Create admins table, migrate admin users from users, add recharge_records.admin_uid"),
    9: ("V9", "Add endpoint + provider columns to token_usage_log for per-endpoint usage tracking"),
    10: ("V10", "Create endpoint_usage_daily aggregation table for fast endpoint stats queries"),
    11: ("V11", "Create suggestions and suggestion_attachments tables"),
}


async def _run_migrations(conn: aiosqlite.Connection) -> None:
    """Run pending schema migrations in order."""
    # Ensure _schema_version table exists
    for stmt in SCHEMA_STATEMENTS:
        if "_schema_version" in stmt and "CREATE TABLE" in stmt:
            await conn.execute(stmt)
            break

    # Get applied versions
    applied: set[int] = set()
    try:
        cursor = await conn.execute("SELECT version FROM _schema_version")
        rows = await cursor.fetchall()
        applied = {r[0] if isinstance(r[0], int) else r["version"] for r in rows}
    except Exception:
        pass

    # Run each pending migration in a transaction
    for version in sorted(_MIGRATIONS.keys()):
        if version in applied:
            continue
        name, desc = _MIGRATIONS[version]
        logger.info("Running migration %s: %s", name, desc)
        try:
            await _execute_migration(conn, version)
            await conn.execute(
                "INSERT INTO _schema_version (version, description) VALUES (?, ?)",
                (version, desc),
            )
            await conn.commit()
            logger.info("Migration %s complete", name)
        except Exception as e:
            await conn.rollback()
            logger.error("Migration %s FAILED: %s", name, e)
            raise RuntimeError(f"Migration {name} failed: {e}") from e


async def _execute_migration(conn: aiosqlite.Connection, version: int) -> None:
    """Execute a single migration by version number."""
    if version == 1:
        # Tables already created by SCHEMA_STATEMENTS — nothing extra to do
        pass

    elif version == 2:
        # Add role column to users if missing
        cursor = await conn.execute("PRAGMA table_info(users)")
        columns = await cursor.fetchall()
        col_names = [c[1] if isinstance(c[0], int) else c["name"] for c in columns]
        if "role" not in col_names:
            await conn.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' NOT NULL")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")

    elif version == 3:
        # Plan value migration
        await conn.execute("UPDATE users SET plan = 'starter' WHERE plan = 'free'")
        await conn.execute("UPDATE users SET plan = 'ultra' WHERE plan = 'enterprise'")

    elif version == 4:
        # Add billing columns to token_usage_log
        cursor = await conn.execute("PRAGMA table_info(token_usage_log)")
        columns = await cursor.fetchall()
        col_names = [c[1] if isinstance(c[0], int) else c["name"] for c in columns]
        if "billed_tokens" not in col_names:
            await conn.execute("ALTER TABLE token_usage_log ADD COLUMN billed_tokens INTEGER DEFAULT 0")
        if "is_estimated" not in col_names:
            await conn.execute("ALTER TABLE token_usage_log ADD COLUMN is_estimated INTEGER DEFAULT 0")

    elif version == 5:
        # token_usage UNIQUE constraint migration: (user_id, date, model) → (user_id, date, model, thread_id)
        cursor = await conn.execute("PRAGMA index_list(token_usage)")
        indexes = await cursor.fetchall()
        needs_migration = False
        for idx in indexes:
            idx_name = idx[1] if isinstance(idx[0], int) else idx["name"]
            if idx_name and idx_name.startswith("sqlite_autoindex"):
                cursor2 = await conn.execute(f"PRAGMA index_info([{idx_name}])")
                cols = await cursor2.fetchall()
                col_names = [c[2] if isinstance(c[0], int) else c["name"] for c in cols]
                if set(col_names) == {"user_id", "date", "model"}:
                    needs_migration = True
                    break
        if needs_migration:
            await conn.execute("DROP TABLE IF EXISTS token_usage")
            for stmt in SCHEMA_STATEMENTS:
                if "token_usage" in stmt and "CREATE TABLE" in stmt:
                    await conn.execute(stmt)
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_token_usage_user_date ON token_usage(user_id, date)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_token_usage_thread ON token_usage(thread_id)"
            )

    elif version == 6:
        # jwt_blacklist.token_hash — idempotent (column may already exist)
        cursor = await conn.execute("PRAGMA table_info(jwt_blacklist)")
        columns = await cursor.fetchall()
        col_names = [c[1] if isinstance(c[0], int) else c["name"] for c in columns]
        if "token_hash" not in col_names:
            await conn.execute("ALTER TABLE jwt_blacklist ADD COLUMN token_hash TEXT")

    elif version == 7:
        # user_devices.refresh_token_hash + is_active — idempotent
        cursor = await conn.execute("PRAGMA table_info(user_devices)")
        columns = await cursor.fetchall()
        col_names = [c[1] if isinstance(c[0], int) else c["name"] for c in columns]
        if "refresh_token_hash" not in col_names:
            await conn.execute("ALTER TABLE user_devices ADD COLUMN refresh_token_hash TEXT")
        if "is_active" not in col_names:
            await conn.execute("ALTER TABLE user_devices ADD COLUMN is_active INTEGER DEFAULT 1 NOT NULL")

    elif version == 8:
        # Create admins table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS admins (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                uid         TEXT UNIQUE NOT NULL,
                username    TEXT UNIQUE NOT NULL,
                email       TEXT UNIQUE NOT NULL,
                password    TEXT NOT NULL,
                status      TEXT DEFAULT 'active',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_admins_uid ON admins(uid)")

        # Migrate existing admin users from users table
        await conn.execute("""
            INSERT OR IGNORE INTO admins (uid, username, email, password, status, created_at, updated_at)
            SELECT uid, username, email, password, 'active', created_at, updated_at
            FROM users WHERE role = 'admin'
        """)

        # Add admin_uid column to recharge_records and backfill
        cursor = await conn.execute("PRAGMA table_info(recharge_records)")
        columns = await cursor.fetchall()
        col_names = [c[1] if isinstance(c[0], int) else c["name"] for c in columns]
        if "admin_uid" not in col_names:
            await conn.execute("ALTER TABLE recharge_records ADD COLUMN admin_uid TEXT")
        await conn.execute("""
            UPDATE recharge_records SET admin_uid = (
                SELECT u.uid FROM users u WHERE u.id = recharge_records.operator_id
            ) WHERE admin_uid IS NULL AND operator_id IS NOT NULL
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_recharge_records_admin ON recharge_records(admin_uid)")

    elif version == 9:
        # Add endpoint + provider columns to token_usage_log
        cursor = await conn.execute("PRAGMA table_info(token_usage_log)")
        columns = await cursor.fetchall()
        col_names = [c[1] if isinstance(c[0], int) else c["name"] for c in columns]
        if "endpoint" not in col_names:
            await conn.execute("ALTER TABLE token_usage_log ADD COLUMN endpoint TEXT DEFAULT ''")
        if "provider" not in col_names:
            await conn.execute("ALTER TABLE token_usage_log ADD COLUMN provider TEXT DEFAULT ''")
        # Always create index (IF NOT EXISTS handles duplicates)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_token_usage_log_endpoint ON token_usage_log(endpoint, created_at DESC)"
        )
        logger.info(
            "V9: endpoint=%s provider=%s in token_usage_log",
            "already exists" if "endpoint" in col_names else "added",
            "already exists" if "provider" in col_names else "added",
        )

    elif version == 10:
        # Create endpoint_usage_daily aggregation table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS endpoint_usage_daily (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                date            DATE NOT NULL,
                provider        TEXT NOT NULL,
                endpoint        TEXT NOT NULL,
                model           TEXT DEFAULT '',
                calls           INTEGER DEFAULT 0,
                input_tokens    INTEGER DEFAULT 0,
                output_tokens   INTEGER DEFAULT 0,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date, provider, endpoint, model)
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_eud_date ON endpoint_usage_daily(date)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_eud_endpoint ON endpoint_usage_daily(provider, endpoint)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_eud_model ON endpoint_usage_daily(model, date)"
        )
        # Backfill from existing token_usage_log (may be empty for fresh installs)
        try:
            await conn.execute("""
                INSERT OR IGNORE INTO endpoint_usage_daily (date, provider, endpoint, model, calls, input_tokens, output_tokens)
                SELECT
                    DATE(created_at),
                    COALESCE(provider, ''),
                    COALESCE(endpoint, ''),
                    COALESCE(model, ''),
                    COUNT(*),
                    SUM(input_tokens),
                    SUM(output_tokens)
                FROM token_usage_log
                WHERE endpoint IS NOT NULL AND endpoint != ''
                GROUP BY DATE(created_at), provider, endpoint, model
            """)
            logger.info("V10: endpoint_usage_daily created and backfilled")
        except Exception as e:
            logger.warning("V10: backfill skipped (%s)", e)

    elif version == 11:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS suggestions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title           TEXT NOT NULL,
                content         TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'open',
                created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS suggestion_attachments (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                suggestion_id   INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
                filename        TEXT NOT NULL,
                stored_name     TEXT NOT NULL,
                mime_type       TEXT,
                size            INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_suggestions_user_created ON suggestions(user_id, created_at DESC)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status, created_at DESC)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_suggestion_attachments_suggestion ON suggestion_attachments(suggestion_id)")


async def close_gateway_db() -> None:
    """Close the gateway database connection."""
    global _connection
    if _connection:
        await _connection.close()
        _connection = None
        logger.info("gateway.db connection closed")


def get_db_path() -> Path:
    """Return the gateway.db path (does NOT open a connection)."""
    if _db_path is None:
        return _resolve_db_path()
    return _db_path


async def get_connection() -> aiosqlite.Connection:
    """Get the active database connection."""
    if _connection is None:
        raise RuntimeError("Database not initialized. Call init_gateway_db() first.")
    return _connection


@asynccontextmanager
async def get_db():
    """Yield the active database connection (for dependency injection)."""
    conn = await get_connection()
    yield conn
