#!/usr/bin/env python3
"""Docker entrypoint — initializes config.yaml and sessions.db on first run."""

import json
import os
import sqlite3
import sys
from pathlib import Path

CONFIG_DIR = Path("/root/.config/evoscientist")
CONFIG_PATH = CONFIG_DIR / "config.yaml"
SESSIONS_DB = CONFIG_DIR / "sessions.db"
GATEWAY_DB = CONFIG_DIR / "gateway.db"

# Map env vars to config.yaml keys
ENV_TO_CONFIG = {
    "ANTHROPIC_API_KEY": "anthropic_api_key",
    "OPENAI_API_KEY": "openai_api_key",
    "NVIDIA_API_KEY": "nvidia_api_key",
    "GOOGLE_API_KEY": "google_api_key",
    "MINIMAX_API_KEY": "minimax_api_key",
    "SILICONFLOW_API_KEY": "siliconflow_api_key",
    "OPENROUTER_API_KEY": "openrouter_api_key",
    "DEEPSEEK_API_KEY": "deepseek_api_key",
    "ZHIPU_API_KEY": "zhipu_api_key",
    "VOLCENGINE_API_KEY": "volcengine_api_key",
    "DASHSCOPE_API_KEY": "dashscope_api_key",
    "MOONSHOT_API_KEY": "moonshot_api_key",
    "KIMI_API_KEY": "kimi_api_key",
    "CUSTOM_OPENAI_API_KEY": "custom_openai_api_key",
    "CUSTOM_OPENAI_BASE_URL": "custom_openai_base_url",
    "CUSTOM_ANTHROPIC_API_KEY": "custom_anthropic_api_key",
    "CUSTOM_ANTHROPIC_BASE_URL": "custom_anthropic_base_url",
    "MINERU_API_BASE": "mineru_api_base",
    "OLLAMA_BASE_URL": "ollama_base_url",
    "TAVILY_API_KEY": "tavily_api_key",
    "SMTP_HOST": "email_smtp_host",
    "SMTP_PORT": "email_smtp_port",
    "SMTP_USER": "email_smtp_user",
    "SMTP_PASSWORD": "email_smtp_password",
    "SMTP_USE_TLS": "email_smtp_use_tls",
    "SMTP_SENDER_NAME": "email_sender_name",
    "SMTP_SENDER_EMAIL": "email_sender_email",
}


def init_config():
    """Create config.yaml from env vars if it doesn't exist."""
    if CONFIG_PATH.exists():
        print(f"[entrypoint] config.yaml already exists, skipping")
        return

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    # Load defaults from EvoScientist config dataclass
    config = {
        "provider": os.getenv("PROVIDER", "anthropic"),
        "model": os.getenv("MODEL", "claude-sonnet-4-6"),
        "default_mode": "daemon",
        "show_thinking": True,
        "ui_backend": "cli",
        "log_level": "warning",
        "reasoning_effort": "high",
    }

    # Map env vars
    for env_key, config_key in ENV_TO_CONFIG.items():
        value = os.getenv(env_key)
        if value:
            # Coerce types
            if value.lower() in ("true", "false"):
                config[config_key] = value.lower() == "true"
            elif value.isdigit():
                config[config_key] = int(value)
            else:
                config[config_key] = value

    import yaml
    with open(CONFIG_PATH, "w") as f:
        yaml.safe_dump(config, f, default_flow_style=False, sort_keys=False)
    print(f"[entrypoint] config.yaml created from environment variables")


def init_sessions_db():
    """Ensure sessions.db has the checkpoints table."""
    if SESSIONS_DB.exists():
        # Verify the table exists
        try:
            conn = sqlite3.connect(str(SESSIONS_DB))
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'")
            if cursor.fetchone():
                conn.close()
                print(f"[entrypoint] sessions.db ready")
                return
            conn.close()
        except Exception:
            pass

    conn = sqlite3.connect(str(SESSIONS_DB))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS checkpoints (
            thread_id TEXT NOT NULL,
            checkpoint_ns TEXT NOT NULL DEFAULT '',
            checkpoint_id TEXT NOT NULL,
            parent_checkpoint_id TEXT,
            type TEXT,
            checkpoint BLOB,
            metadata BLOB,
            PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
        )"""
    )
    conn.commit()
    conn.close()
    print(f"[entrypoint] sessions.db initialized with checkpoints table")


def init_admin():
    """Create default super admin if no admin exists."""
    if not GATEWAY_DB.exists():
        print(f"[entrypoint] gateway.db not yet created, skipping admin init")
        return

    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "admin123")
    email = os.getenv("ADMIN_EMAIL", "admin@evoscientist.local")

    conn = sqlite3.connect(str(GATEWAY_DB))
    try:
        # Check if any admin already exists
        cursor = conn.execute("SELECT id FROM admins LIMIT 1")
        if cursor.fetchone():
            print(f"[entrypoint] admin user already exists, skipping")
            return

        import bcrypt
        import uuid

        uid = uuid.uuid4().hex[:8]
        pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode()

        conn.execute(
            """INSERT INTO users (uid, username, email, password, role, email_verified, plan, status)
               VALUES (?, ?, ?, ?, 'admin', 1, 'ultra', 'active')""",
            (uid, username, email, pw),
        )
        conn.execute(
            "INSERT INTO admins (uid, username, email, password) VALUES (?, ?, ?, ?)",
            (uid, username, email, pw),
        )
        conn.commit()
        print(f"[entrypoint] super admin created: {username} / {email}")
    except Exception as e:
        print(f"[entrypoint] admin creation skipped: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    init_config()
    init_sessions_db()
    init_admin()
    # Run the main command
    os.execvp(sys.argv[1], sys.argv[1:])
