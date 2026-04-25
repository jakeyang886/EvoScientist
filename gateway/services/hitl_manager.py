"""HITL Manager — manages Human-In-The-Loop state."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class HITLState:
    """Represents a pending HITL interaction."""
    interrupt_id: str
    thread_id: str
    user_uid: str
    tool_name: str
    args: dict
    timeout: int = 300  # seconds
    created_at: datetime = field(default_factory=datetime.utcnow)
    resolved: bool = False
    approved: bool | None = None
    answer: str | None = None


class HITLManager:
    """Manages pending HITL interactions per thread."""

    def __init__(self):
        self._pending: dict[str, HITLState] = {}  # interrupt_id -> state
        self._events: dict[str, asyncio.Event] = {}  # interrupt_id -> event

    async def create_interrupt(
        self,
        interrupt_id: str,
        thread_id: str,
        user_uid: str,
        tool_name: str,
        args: dict,
        timeout: int = 300,
    ) -> HITLState:
        """Register a new HITL interrupt."""
        state = HITLState(
            interrupt_id=interrupt_id,
            thread_id=thread_id,
            user_uid=user_uid,
            tool_name=tool_name,
            args=args,
            timeout=timeout,
        )
        self._pending[interrupt_id] = state
        self._events[interrupt_id] = asyncio.Event()
        logger.info("HITL created: %s (tool=%s, timeout=%ds)", interrupt_id, tool_name, timeout)
        return state

    async def resolve(
        self,
        interrupt_id: str,
        approved: bool | None = None,
        answer: str | None = None,
    ) -> HITLState | None:
        """Resolve a pending HITL."""
        state = self._pending.get(interrupt_id)
        if not state:
            return None

        state.resolved = True
        state.approved = approved
        state.answer = answer

        event = self._events.get(interrupt_id)
        if event:
            event.set()

        logger.info("HITL resolved: %s (approved=%s)", interrupt_id, approved)
        return state

    async def wait_for_resolution(self, interrupt_id: str, timeout: int = 300) -> HITLState | None:
        """Wait for a HITL to be resolved, with timeout."""
        event = self._events.get(interrupt_id)
        if not event:
            return None

        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("HITL timed out: %s", interrupt_id)
            state = self._pending.get(interrupt_id)
            if state:
                state.resolved = True
            return state

        return self._pending.get(interrupt_id)

    def get_pending(self, interrupt_id: str) -> HITLState | None:
        """Get a pending HITL state."""
        return self._pending.get(interrupt_id)

    def cleanup(self, interrupt_id: str) -> None:
        """Remove a resolved HITL from memory."""
        self._pending.pop(interrupt_id, None)
        self._events.pop(interrupt_id, None)


# Module-level singleton
_hitl_manager: HITLManager | None = None


def get_hitl_manager() -> HITLManager:
    global _hitl_manager
    if _hitl_manager is None:
        _hitl_manager = HITLManager()
    return _hitl_manager
