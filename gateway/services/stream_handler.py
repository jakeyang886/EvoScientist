"""Stream Handler — creates Agent and streams SSE events."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import Request

logger = logging.getLogger(__name__)

# Global thread status tracking: { thread_id: status }
_thread_status: dict[str, str] = {}

def set_thread_status(thread_id: str, status: str):
    _thread_status[thread_id] = status

def get_thread_status() -> dict[str, str]:
    return dict(_thread_status)


class StreamHandler:
    """Creates an Agent instance and streams events as SSE."""

    def __init__(
        self,
        thread_id: str,
        user_uid: str,
        workspace_dir: str,
        memory_dir: str,
        model: str | None = None,
        model_params: dict | None = None,
    ):
        self.thread_id = thread_id
        self.user_uid = user_uid
        self.workspace_dir = workspace_dir
        self.memory_dir = memory_dir
        self.model = model
        self.model_params = model_params or {}
        self.event_counter = 0

    async def stream(
        self,
        message: str,
        files: list[dict],
        request: Request,
        conversation_history: list[dict] | None = None,
    ):
        """Generate SSE events from Agent execution."""
        import time
        # Mark thread as running immediately
        set_thread_status(self.thread_id, "running")
        try:
            start_time = time.time()
            logger.info("🟢 Stream request received for thread %s", self.thread_id)

            # 1. Attach files to message
            message_with_files = self._attach_files(message, files)

            # 1.5 Emit file_upload SSE event if files are present
            if files:
                event_data = {
                    "type": "file_upload",
                    "thread_id": self.thread_id,
                    "id": "0",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "files": [
                        {
                            "filename": f.get("virtual_path", "").split("/")[-1],
                            "virtual_path": f.get("virtual_path", ""),
                            "size": f.get("size", 0),
                        }
                        for f in files
                    ],
                }
                yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"

            # 2. Send early feedback so frontend shows a thinking indicator
            #    before the slow agent creation phase
            yield f"data: {json.dumps({'type': 'thinking', 'content': ''}, ensure_ascii=False)}\n\n"

            # 3. Get persistent checkpointer and create agent
            from EvoScientist.sessions import get_checkpointer
            from EvoScientist.stream.events import stream_agent_events

            async with get_checkpointer() as cp:
                logger.info("🤖 Creating agent with persistent memory...")
                agent = self._create_agent(checkpointer=cp)
                logger.info("✅ Agent created in %.2fs", time.time() - start_time)

                # 4. Stream agent events (intercept agent's "done", we send our own)
                async for event in stream_agent_events(agent, message_with_files, self.thread_id):
                    # Don't forward agent's "done" — we send our own
                    if event.get("type") == "done":
                        continue

                    self.event_counter += 1
                    try:
                        yield f"id: {self.event_counter}\n"
                        yield f"event: {event['type']}\n"
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    except Exception:
                        # Frontend disconnected, yield failed. Continue running.
                        pass

            # 5. Send done
            yield "id: done\n"
            yield "event: done\n"
            yield 'data: {"type": "done"}\n\n'

        except NotImplementedError as e:
            if "Unknown serialization type" in str(e):
                logger.error("Corrupted checkpoint for thread %s: %s", self.thread_id, e)
                yield "event: error\ndata: "
                yield json.dumps({"type": "error", "code": "checkpoint_corrupted", "message": "对话上下文已损坏，请新建对话。"})
                yield "\n\n"
            else:
                raise
        except asyncio.CancelledError:
            logger.info("Stream cancelled for thread %s", self.thread_id)
        except Exception as e:
            logger.error("Stream error for thread %s: %s", self.thread_id, e, exc_info=True)
        finally:
            # Mark thread as idle when finished
            set_thread_status(self.thread_id, "idle")

    def _create_agent(self, checkpointer=None):
        """Create an Agent instance with user-isolated paths."""
        from EvoScientist import create_cli_agent
        from EvoScientist.config.settings import load_config
        from EvoScientist.paths import set_active_workspace, set_workspace_root

        logger.info("📁 Setting workspace: %s", self.workspace_dir)

        # Web mode: disable HITL approval and ask_user for fully autonomous operation
        cfg = load_config()
        cfg.auto_approve = True  # Auto-approve all tool executions
        cfg.auto_mode = True     # Run unattended: imply auto_approve + disable ask_user

        # Only pass known kwargs to create_cli_agent to avoid unexpected argument errors
        allowed_params = {"model", "provider", "reasoning_effort"}
        filtered_params = {
            k: v for k, v in (self.model_params or {}).items()
            if k in allowed_params
        }

        agent = create_cli_agent(
            workspace_dir=self.workspace_dir,
            memory_dir=self.memory_dir,
            source="web",
            user_id=self.user_uid,
            model=self.model,
            config=cfg,
            checkpointer=checkpointer,  # Pass persistent checkpointer
            **filtered_params,
        )
        return agent

    def _attach_files(self, message: str, files: list[dict]) -> str:
        """Inject file references into the message."""
        if not files:
            return message
        file_refs = "\n".join(
            f'[File: {f.get("virtual_path", "unknown")}]' for f in files
        )
        return f"{message}\n\n{file_refs}"
