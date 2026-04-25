"""ThreadRegistry — in-process thread execution state tracking."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List

logger = logging.getLogger(__name__)

ENTRY_TTL = timedelta(minutes=30)


@dataclass
class ThreadEntry:
    thread_id: str
    user_uid: str
    started_at: datetime
    cancel_scope_id: str | None = None


class ThreadRegistry:
    """Process-wide thread execution state registry.

    Replaces the bare _thread_status dict in stream_handler.py. [G15]
    """

    def __init__(self, ttl: timedelta | None = None):
        self._entries: Dict[str, ThreadEntry] = {}
        self._lock = asyncio.Lock()
        self._cancel_scopes: Dict[str, asyncio.Event] = {}
        self._cancelled_scopes: set[str] = set()  # Track explicitly cancelled scopes
        self._ttl = ttl or ENTRY_TTL

    async def register(self, thread_id: str, user_uid: str) -> tuple[bool, str | None]:
        """Register a thread as running.

        Returns (success, cancel_scope_id).
        If already running (and not expired), returns (False, None).
        """
        async with self._lock:
            if thread_id in self._entries:
                entry = self._entries[thread_id]
                if datetime.utcnow() - entry.started_at < self._ttl:
                    return False, None
                logger.warning("TTL expired for thread %s, cleaning up", thread_id)
                self._cleanup_entry(thread_id)

            scope_id = str(uuid.uuid4())
            self._entries[thread_id] = ThreadEntry(
                thread_id=thread_id,
                user_uid=user_uid,
                started_at=datetime.utcnow(),
                cancel_scope_id=scope_id,
            )
            self._cancel_scopes[scope_id] = asyncio.Event()
            return True, scope_id

    async def unregister(self, thread_id: str) -> None:
        async with self._lock:
            self._cleanup_entry(thread_id)

    def _cleanup_entry(self, thread_id: str) -> None:
        """Must be called inside _lock."""
        entry = self._entries.pop(thread_id, None)
        if entry and entry.cancel_scope_id:
            self._cancel_scopes.pop(entry.cancel_scope_id, None)

    async def get_running_count(self, user_uid: str) -> int:
        async with self._lock:
            return sum(1 for e in self._entries.values() if e.user_uid == user_uid)

    async def get_user_running_threads(self, user_uid: str) -> List[str]:
        async with self._lock:
            return [e.thread_id for e in self._entries.values() if e.user_uid == user_uid]

    async def is_running(self, thread_id: str) -> bool:
        return thread_id in self._entries

    async def get_all_running(self) -> Dict[str, dict]:
        async with self._lock:
            return {
                tid: {
                    "user_uid": e.user_uid,
                    "started_at": e.started_at.isoformat(),
                }
                for tid, e in self._entries.items()
            }

    async def force_unregister_user(self, user_uid: str) -> List[str]:
        """Force-clear all active threads for a user and trigger cancel events. [G12]"""
        async with self._lock:
            removed = []
            for tid, entry in list(self._entries.items()):
                if entry.user_uid == user_uid:
                    if entry.cancel_scope_id and entry.cancel_scope_id in self._cancel_scopes:
                        self._cancel_scopes[entry.cancel_scope_id].set()
                        self._cancelled_scopes.add(entry.cancel_scope_id)
                    self._cleanup_entry(tid)
                    removed.append(tid)
            return removed

    def is_cancelled(self, scope_id: str) -> bool:
        # Check explicit cancel set first (survives cleanup)
        if scope_id in self._cancelled_scopes:
            return True
        event = self._cancel_scopes.get(scope_id)
        return event is not None and event.is_set()

    async def cleanup_expired(self) -> int:
        """Remove TTL-expired entries (callable from background task)."""
        async with self._lock:
            now = datetime.utcnow()
            expired = [
                tid for tid, e in self._entries.items()
                if now - e.started_at >= self._ttl
            ]
            for tid in expired:
                entry = self._entries[tid]
                logger.warning(
                    "Cleaning expired entry: thread=%s user=%s age=%s",
                    tid, entry.user_uid, now - entry.started_at,
                )
                if entry.cancel_scope_id and entry.cancel_scope_id in self._cancel_scopes:
                    self._cancel_scopes[entry.cancel_scope_id].set()
                self._cleanup_entry(tid)
            return len(expired)

    async def startup_cleanup(self) -> None:
        """Clear all entries on gateway startup (all SSE streams are dead). [G3]"""
        async with self._lock:
            self._entries.clear()
            self._cancel_scopes.clear()
            self._cancelled_scopes.clear()
            logger.info("ThreadRegistry startup cleanup completed")


thread_registry = ThreadRegistry()
