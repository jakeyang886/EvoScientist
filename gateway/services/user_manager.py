"""User Manager — handles user lifecycle and cascading deletion."""

from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


class UserManager:
    """Manages user lifecycle operations."""

    async def delete_user_cascade(self, user_uid: str) -> dict:
        """Delete a user and all associated data.

        Steps:
        1. Query user uid
        2. Query all threads (source='web' AND user_id=uid)
        3. Bulk delete sessions.db records
        4. Delete workspace directories
        5. Delete memory directory
        6. Soft delete gateway.db records
        """
        from gateway.database import get_connection
        from gateway.services.session_store import SessionStore

        conn = await get_connection()

        # 1. Get user
        user_row = await conn.execute_fetchone("SELECT * FROM users WHERE uid = ?", (user_uid,))
        if not user_row:
            return {"error": "User not found"}
        user = dict(user_row)
        user_id = user["id"]

        results = {
            "user_uid": user_uid,
            "threads_deleted": 0,
            "workspaces_deleted": 0,
            "memory_deleted": False,
            "gateway_records_cleaned": 0,
        }

        # 2. Find all threads
        store = SessionStore()
        threads = await store.list_threads(user_uid)

        # 3. Delete from sessions.db
        for thread in threads:
            await store.delete_thread(thread["thread_id"], user_uid)
            results["threads_deleted"] += 1

        # 4. Delete workspace directories
        from EvoScientist.config.settings import get_config_dir
        runs_base = Path.home() / ".evoscientist" / "runs" / user_uid
        if runs_base.exists():
            try:
                await asyncio.to_thread(shutil.rmtree, runs_base)
                results["workspaces_deleted"] = 1
            except Exception as e:
                logger.error("Failed to delete runs dir %s: %s", runs_base, e)

        # 5. Delete memory directory
        memory_dir = Path.home() / ".evoscientist" / "memory" / user_uid
        if memory_dir.exists():
            try:
                await asyncio.to_thread(shutil.rmtree, memory_dir)
                results["memory_deleted"] = True
            except Exception as e:
                logger.error("Failed to delete memory dir %s: %s", memory_dir, e)

        # 6. Soft delete gateway.db records
        try:
            await conn.execute("UPDATE users SET status = 'deleted' WHERE id = ?", (user_id,))
            await conn.execute("DELETE FROM token_usage WHERE user_id = ?", (user_id,))
            await conn.execute("DELETE FROM login_logs WHERE user_id = ?", (user_id,))
            await conn.execute("DELETE FROM login_failures WHERE user_id = ?", (user_id,))
            await conn.execute("DELETE FROM user_devices WHERE user_id = ?", (user_id,))
            await conn.execute("DELETE FROM jwt_blacklist WHERE token_hash IN (SELECT token_hash FROM jwt_blacklist)")  # cleanup
            await conn.execute("DELETE FROM email_verification_tokens WHERE user_id = ?", (user_id,))
            await conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
            await conn.execute("DELETE FROM invite_codes WHERE created_by = ?", (user_id,))
            await conn.execute("DELETE FROM account_deletions WHERE user_id = ?", (user_id,))
            await conn.commit()
            results["gateway_records_cleaned"] = 1
        except Exception as e:
            logger.error("Failed to clean gateway.db for user %s: %s", user_uid, e)

        return results
