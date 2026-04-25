"""Session Store — reads sessions.db with source/user_id filtering."""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _get_sessions_db_path() -> Path:
    """Get sessions.db path (same as CLI)."""
    from EvoScientist.config.settings import get_config_dir
    return get_config_dir() / "sessions.db"


def _extract_metadata(raw: str | None) -> dict | None:
    """Parse metadata JSON from checkpoint row."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


class SessionStore:
    """Synchronous reader for sessions.db (used by Gateway REST API).

    All write operations are handled by LangGraph's AsyncSqliteSaver
    inside the Agent — this class only reads.
    """

    def __init__(self):
        self.db_path = _get_sessions_db_path()

    def _ensure_checkpoints_table(self) -> None:
        """Create the checkpoints table if it does not exist.

        This table is normally created by LangGraph's AsyncSqliteSaver,
        but the gateway needs it before the first agent run for thread
        creation and listing.
        """
        conn = sqlite3.connect(str(self.db_path))
        try:
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
        finally:
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    async def list_threads(self, user_uid: str) -> list[dict]:
        """List threads for a specific web user (source='web' AND user_id=uid)."""
        conn = self._connect()
        try:
            # Use GROUP BY to get one row per thread_id, picking the row with
            # the latest updated_at. This handles multiple checkpoint rows per thread.
            cursor = conn.execute(
                """SELECT thread_id, metadata FROM checkpoints
                   WHERE metadata IS NOT NULL
                   AND json_extract(CAST(metadata AS TEXT), '$.source') = 'web'
                   AND json_extract(CAST(metadata AS TEXT), '$.user_id') = ?
                   GROUP BY thread_id
                   ORDER BY MAX(json_extract(CAST(metadata AS TEXT), '$.updated_at')) DESC
                   LIMIT 50""",
                (str(user_uid),),
            )
            threads = []
            for row in cursor.fetchall():
                meta = _extract_metadata(row["metadata"])
                threads.append({
                    "thread_id": row["thread_id"],
                    "title": (meta or {}).get("title", "New conversation"),
                    "created_at": (meta or {}).get("created_at", ""),
                    "updated_at": (meta or {}).get("updated_at", ""),
                    "source": (meta or {}).get("source", "web"),
                    "status": "active",
                    "metadata": meta,
                })
            return threads
        finally:
            conn.close()

    async def get_thread(self, thread_id: str, user_uid: str) -> dict | None:
        """Get a single thread, verifying ownership."""
        conn = self._connect()
        try:
            cursor = conn.execute(
                """SELECT thread_id, metadata FROM checkpoints
                   WHERE thread_id = ?
                   AND json_extract(CAST(metadata AS TEXT), '$.user_id') = ?""",
                (thread_id, str(user_uid)),
            )
            row = cursor.fetchone()
            if not row:
                return None
            meta = _extract_metadata(row["metadata"])
            return {
                "thread_id": row["thread_id"],
                "title": (meta or {}).get("title", "New conversation"),
                "created_at": (meta or {}).get("created_at", ""),
                "updated_at": (meta or {}).get("updated_at", ""),
                "source": (meta or {}).get("source", "web"),
                "status": "active",
                "metadata": meta,
            }
        finally:
            conn.close()

    async def create_thread(self, thread_id: str, user_uid: str, source: str = "web", workspace_dir: str | None = None) -> dict:
        """Create or update a thread entry in sessions.db with metadata."""
        import datetime
        self._ensure_checkpoints_table()
        conn = self._connect()
        try:
            now = datetime.datetime.utcnow().isoformat() + "Z"
            # Ensure user_id is always a string to match query comparison
            uid_str = str(user_uid)
            metadata = json.dumps({
                "source": source,
                "user_id": uid_str,
                "thread_id": thread_id,
                "agent_name": "EvoScientist",
                "title": "New conversation",
                "created_at": now,
                "updated_at": now,
                "workspace_dir": workspace_dir or "",
            })
            conn.execute(
                """INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, metadata)
                   VALUES (?, '__evo_metadata__', '', ?)
                   ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id)
                   DO UPDATE SET metadata=excluded.metadata""",
                (thread_id, metadata),
            )
            conn.commit()
            return {
                "thread_id": thread_id,
                "title": "New conversation",
                "source": source,
            }
        finally:
            conn.close()

    async def touch_thread(self, thread_id: str, user_uid: str) -> None:
        """Update the `updated_at` timestamp for an existing thread.

        This ensures the thread appears at the top of the history list
        when the user sends a new message.
        """
        import datetime
        conn = self._connect()
        try:
            now = datetime.datetime.utcnow().isoformat() + "Z"
            uid_str = str(user_uid)
            # Update metadata JSON in place. We target rows that have
            # the correct source and user_id to avoid updating CLI threads.
            conn.execute(
                """UPDATE checkpoints
                   SET metadata = json_set(
                       CAST(metadata AS TEXT),
                       '$.updated_at', ?
                   )
                   WHERE thread_id = ?
                   AND json_extract(CAST(metadata AS TEXT), '$.source') = 'web'
                   AND json_extract(CAST(metadata AS TEXT), '$.user_id') = ?""",
                (now, thread_id, uid_str),
            )
            conn.commit()
        finally:
            conn.close()

    async def delete_thread(self, thread_id: str, user_uid: str) -> bool:
        """Delete a thread from sessions.db and cascade to workspace directory.

        Returns True if deleted, False if not found.
        """
        import asyncio
        import shutil

        conn = self._connect()
        try:
            uid_str = str(user_uid)
            # 1. Get metadata (for workspace_dir)
            cursor = conn.execute(
                "SELECT metadata FROM checkpoints WHERE thread_id = ? AND json_extract(CAST(metadata AS TEXT), '$.user_id') = ?",
                (thread_id, uid_str),
            )
            row = cursor.fetchone()
            if not row:
                return False

            meta = _extract_metadata(row["metadata"])
            workspace_dir = (meta or {}).get("workspace_dir")

            # 2. Delete from DB
            conn.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
            conn.commit()

            # 3. Async delete workspace directory
            if workspace_dir:
                async def _delete_workspace():
                    try:
                        ws_path = Path(workspace_dir).expanduser()
                        if ws_path.exists():
                            shutil.rmtree(ws_path)
                            logger.info("Deleted workspace: %s", ws_path)
                    except Exception as e:
                        logger.error("Failed to delete workspace %s: %s", workspace_dir, e)

                asyncio.create_task(_delete_workspace())

            return True
        finally:
            conn.close()

    async def rename_thread(self, thread_id: str, user_uid: str, title: str) -> dict | None:
        """Update the title of a thread."""
        conn = self._connect()
        try:
            uid_str = str(user_uid)
            cursor = conn.execute(
                "SELECT metadata FROM checkpoints WHERE thread_id = ? AND json_extract(CAST(metadata AS TEXT), '$.user_id') = ?",
                (thread_id, uid_str),
            )
            row = cursor.fetchone()
            if not row:
                return None

            meta = _extract_metadata(row["metadata"])
            if not meta:
                return None

            meta["title"] = title
            conn.execute(
                "UPDATE checkpoints SET metadata = ? WHERE thread_id = ?",
                (json.dumps(meta), thread_id),
            )
            conn.commit()
            return {
                "thread_id": thread_id,
                "title": title,
                "source": meta.get("source", "web"),
                "status": "active",
                "metadata": meta,
            }
        finally:
            conn.close()
