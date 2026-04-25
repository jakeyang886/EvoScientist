"""Thread routes — CRUD, stream, cancel, messages, export."""

import datetime
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from gateway.models.thread import (
    StreamRequest,
    ThreadCreate,
    ThreadListResponse,
    ThreadRenameRequest,
    ThreadResponse,
)
from gateway.services.session_store import SessionStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threads", tags=["threads"])


def _get_message_file(thread_id: str) -> Path:
    """Get the JSON file path for storing thread messages."""
    from EvoScientist.config.settings import get_config_dir
    msg_dir = get_config_dir() / "messages"
    msg_dir.mkdir(parents=True, exist_ok=True)
    return msg_dir / f"{thread_id}.json"


def _load_messages(thread_id: str) -> list[dict]:
    """Load messages from disk for a thread."""
    msg_file = _get_message_file(thread_id)
    if msg_file.exists():
        try:
            return json.loads(msg_file.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_messages(thread_id: str, messages: list[dict]) -> None:
    """Save messages to disk for a thread."""
    msg_file = _get_message_file(thread_id)
    msg_file.write_text(json.dumps(messages, ensure_ascii=False, indent=2))


def _get_user_uid(request: Request) -> str:
    """Extract user_uid from request state (set by AuthMiddleware)."""
    uid = getattr(request.state, "user_uid", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return uid


def _generate_title_from_message(message: str, max_length: int = 30) -> str:
    """Generate a brief title from the first user message."""
    first_line = message.split("\n")[0].strip()
    if len(first_line) > max_length:
        sentence_end = first_line.find(".")
        if sentence_end == -1:
            sentence_end = first_line.find("。")
        if sentence_end == -1:
            sentence_end = first_line.find("?")
        if sentence_end == -1:
            sentence_end = first_line.find("？")
        if sentence_end > 0 and sentence_end < max_length:
            first_line = first_line[:sentence_end + 1]
    if len(first_line) > max_length:
        first_line = first_line[:max_length].rstrip() + "..."
    return first_line if first_line else "New conversation"


async def _auto_rename_thread(thread_id: str, user_uid: str, first_message: str) -> None:
    """Auto-rename thread based on first user message."""
    store = SessionStore()
    thread = await store.get_thread(thread_id, user_uid)
    if not thread:
        return
    current_title = thread.get("title", "")
    if current_title == "New conversation":
        new_title = _generate_title_from_message(first_message)
        await store.rename_thread(thread_id, user_uid, new_title)


async def _record_token_usage(
    user_uid: str,
    thread_id: str,
    input_tokens: int,
    output_tokens: int,
    model: str = "",
    endpoint: str = "",
    provider: str = "",
) -> None:
    """Record token usage into the gateway.db. Best-effort, non-blocking."""
    try:
        from gateway.services.token_tracker import record_token_usage
        await record_token_usage(user_uid, thread_id, input_tokens, output_tokens, model, endpoint, provider)
    except Exception as e:
        logger.warning("Failed to record token usage: %s", e)


def _error_response(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, "status": status})


@router.get("")
async def list_threads(request: Request):
    """List threads for the current user with running status from ThreadRegistry."""
    user_uid = _get_user_uid(request)
    store = SessionStore()
    threads = await store.list_threads(user_uid)

    from gateway.services.thread_registry import thread_registry
    running = await thread_registry.get_user_running_threads(user_uid)
    running_set = set(running)

    for t in threads:
        t["status"] = "running" if t.get("thread_id") in running_set else "idle"

    return {"threads": threads, "total": len(threads)}


@router.get("/status")
async def get_thread_status(request: Request):
    """Get execution status of all active threads."""
    from gateway.services.thread_registry import thread_registry
    return {"statuses": await thread_registry.get_all_running()}


@router.post("")
async def create_thread(body: ThreadCreate, request: Request):
    """Create a new thread and write to sessions.db immediately."""
    import uuid

    from gateway.services.session_store import SessionStore

    user_uid = _get_user_uid(request)
    thread_id = str(uuid.uuid4())
    store = SessionStore()
    workspace_dir = str(Path.home() / ".evoscientist" / "runs" / user_uid / f"web_{thread_id}")
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    await store.create_thread(thread_id=thread_id, user_uid=user_uid, source="web", workspace_dir=workspace_dir)
    logger.info("Thread created for user %s, thread %s", user_uid, thread_id)
    return {"thread_id": thread_id, "title": "New conversation", "workspace_dir": workspace_dir}


@router.get("/{thread_id}")
async def get_thread(thread_id: str, request: Request):
    """Get thread details."""
    user_uid = _get_user_uid(request)
    store = SessionStore()
    thread = await store.get_thread(thread_id, user_uid)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str, request: Request):
    """Delete thread — cascades to workspace directory."""
    user_uid = _get_user_uid(request)
    store = SessionStore()
    success = await store.delete_thread(thread_id, user_uid)
    if not success:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {}


@router.patch("/{thread_id}")
async def rename_thread(thread_id: str, body: ThreadRenameRequest, request: Request):
    """Rename a thread."""
    user_uid = _get_user_uid(request)
    store = SessionStore()
    thread = await store.rename_thread(thread_id, user_uid, body.title)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


@router.get("/{thread_id}/messages")
async def get_messages(thread_id: str, request: Request):
    """Get message history for a thread."""
    user_uid = _get_user_uid(request)
    store = SessionStore()
    thread = await store.get_thread(thread_id, user_uid)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = _load_messages(thread_id)
    return {"messages": messages, "total": len(messages)}


@router.post("/{thread_id}/stream")
async def stream_thread(thread_id: str, body: StreamRequest, request: Request):
    """Send a message and receive SSE stream response.

    Pre-stream checks: rate limit → balance → concurrency.
    """
    from gateway.config import get_gateway_config
    from gateway.middleware.balance_check import check_user_balance
    from gateway.services.rate_limiter import rate_limiter, request_rate_limiter
    from gateway.services.stream_handler import StreamHandler
    from gateway.services.thread_registry import thread_registry

    user_uid = _get_user_uid(request)
    store = SessionStore()

    # Reject new streams during shutdown [G29]
    from gateway.main import _shutting_down
    if _shutting_down:
        raise _error_response("SERVICE_UNAVAILABLE", "Gateway is shutting down", 503)

    # Verify ownership
    thread = await store.get_thread(thread_id, user_uid)
    if not thread:
        raise _error_response("THREAD_NOT_FOUND", "Thread not found", 404)
    await store.touch_thread(thread_id, user_uid)

    # ── Pre-stream checks ──────────────────────────────────────

    # 0. Get user plan (needed for plan-aware rate limits)
    from gateway.pricing_config import get_plan_config
    from gateway.database import get_connection as _get_conn_for_plan
    _plan_db = await _get_conn_for_plan()
    _plan_row = await _plan_db.execute_fetchone(
        "SELECT b.plan FROM user_balances b JOIN users u ON u.id = b.user_id WHERE u.uid = ?",
        (user_uid,),
    )
    user_plan = (_plan_row["plan"] if _plan_row else None) or "starter"
    _plan_cfg = get_plan_config(user_plan)

    # 1. Token rate limit
    if rate_limiter:
        allowed, reason, retry_after = await rate_limiter.check(user_uid, plan=user_plan)
        if not allowed:
            raise _error_response(reason, f"Rate limited, retry after {retry_after}s", 429)

    # 1b. Request count rate limit (5h / week)
    if request_rate_limiter:
        allowed, reason, retry_after = await request_rate_limiter.check(user_uid, plan=user_plan)
        if not allowed:
            raise _error_response(reason, f"请求次数已达上限，请 {retry_after}s 后重试", 429)

    # 2. Balance / subscription / status
    try:
        balance_info = await check_user_balance(user_uid)
    except Exception as e:
        if hasattr(e, "detail") and isinstance(e.detail, dict):
            code = e.detail.get("code", "FORBIDDEN")
            msg = e.detail.get("message", str(e))
            status_code = e.status_code
        else:
            code, msg, status_code = "FORBIDDEN", str(e), 403
        raise _error_response(code, msg, status_code)

    # 3. Concurrent thread limit — evict stale threads instead of rejecting
    plan = balance_info.get("plan", user_plan)
    max_concurrent = _plan_cfg.get("max_concurrent_threads") or balance_info.get("concurrent_limit", 1)
    running_count = await thread_registry.get_running_count(user_uid)

    if running_count >= max_concurrent:
        # Check if this is the same thread_id already running → 409
        user_threads = await thread_registry.get_user_running_threads(user_uid)
        if thread_id in user_threads:
            raise _error_response("THREAD_ALREADY_RUNNING", "该对话正在执行中", 409)

        # Evict all existing threads for this user to make room for the new request.
        # This handles the common case where the frontend aborts an old SSE stream
        # (client-side abort) but the server hasn't noticed yet — the registry still
        # holds the stale entry.  force_unregister_user triggers cancel events so
        # the old stream will stop gracefully.
        evicted = await thread_registry.force_unregister_user(user_uid)
        logger.info(
            "Concurrent limit reached (%d/%d), evicted %d stale threads for user=%s new_thread=%s",
            running_count, max_concurrent, len(evicted), user_uid[:8], thread_id[:8],
        )

    # 4. Register thread (handles same-thread-id dedup)
    success, scope_id = await thread_registry.register(thread_id, user_uid)
    if not success:
        raise _error_response("THREAD_ALREADY_RUNNING", "该对话正在执行中", 409)

    # ── Setup ──────────────────────────────────────────────────

    workspace_dir = (thread.get("metadata", {}) or {}).get("workspace_dir")
    if not workspace_dir:
        workspace_dir = str(Path.home() / ".evoscientist" / "runs" / user_uid / f"web_{thread_id}")
        Path(workspace_dir).mkdir(parents=True, exist_ok=True)

    memory_dir = str(Path.home() / ".evoscientist" / "memory" / user_uid)
    Path(memory_dir).mkdir(parents=True, exist_ok=True)

    handler = StreamHandler(
        thread_id=thread_id,
        user_uid=user_uid,
        workspace_dir=workspace_dir,
        memory_dir=memory_dir,
        model=body.model,
        model_params=body.model_params,
    )

    # Load existing messages, append user message
    existing = _load_messages(thread_id)
    user_msg: dict[str, Any] = {
        "role": "user",
        "content": body.message,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }
    if body.files:
        user_msg["attachedFiles"] = []
        for f in body.files:
            vp = f.get("virtual_path", "")
            raw_name = vp.split("/")[-1] if vp else "unknown"
            clean_name = raw_name.split("_", 1)[-1] if "_" in raw_name else raw_name
            user_msg["attachedFiles"].append({
                "filename": clean_name or "unknown",
                "virtual_path": vp,
                "size": f.get("size", 0),
            })
    existing.append(user_msg)

    new_title = _generate_title_from_message(body.message)

    async def _stream_with_tracking():
        """Wrap the stream with token tracking, cancel checks, and balance_update."""
        import asyncio

        from gateway.services.token_tracker import record_token_usage

        # Send title_updated immediately
        title_event = json.dumps({"type": "title_updated", "thread_id": thread_id, "title": new_title})
        yield f"data: {title_event}\n\n"

        asyncio.create_task(_auto_rename_thread(thread_id, user_uid, body.message))

        full_content = ""
        thinking_content = ""
        thinking_start_time = None
        tool_calls = []
        acc_input = 0
        acc_output = 0
        acc_model = body.model or handler.model or ""
        acc_endpoint = ""
        acc_provider = ""
        _recorded = False
        normal_done = False

        try:
            async for event in handler.stream(body.message, body.files, request, conversation_history=existing):
                # Check force-cancel [G12]
                if thread_registry.is_cancelled(scope_id):
                    logger.info("Thread %s force-cancelled", thread_id)
                    yield "event: error\ndata: "
                    yield json.dumps({"type": "error", "code": "FORCE_CANCELLED", "message": "连接已被管理员中断"})
                    yield "\n\n"
                    break

                if event.startswith("data: "):
                    try:
                        data = json.loads(event[6:])
                        if data.get("type") == "text":
                            full_content += data.get("content", "")
                        elif data.get("type") in ("thinking", "reasoning"):
                            content = data.get("content", "")
                            if content:
                                thinking_content += content
                                if thinking_start_time is None:
                                    thinking_start_time = time.monotonic()
                        elif data.get("type") == "tool_call":
                            tool_calls.append({
                                "tool_call_id": data.get("id", ""),
                                "name": data.get("name", ""),
                                "args": data.get("args", {}),
                                "status": "running",
                            })
                        elif data.get("type") == "tool_result":
                            if tool_calls:
                                tool_calls[-1]["status"] = "success" if data.get("success") else "error"
                                tool_calls[-1]["output"] = data.get("content", "")
                        elif data.get("type") == "usage_stats":
                            acc_input += data.get("input_tokens", 0)
                            acc_output += data.get("output_tokens", 0)
                            if data.get("model"):
                                acc_model = data["model"]
                            if data.get("endpoint"):
                                acc_endpoint = data["endpoint"]
                            if data.get("provider"):
                                acc_provider = data["provider"]
                        elif data.get("type") == "done":
                            normal_done = True
                            # Save assistant message
                            assistant_msg = {
                                "role": "assistant",
                                "content": full_content or (data.get("response") or ""),
                                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                            }
                            if thinking_content:
                                assistant_msg["thinking"] = thinking_content
                                if thinking_start_time is not None:
                                    thinking_ms = int((time.monotonic() - thinking_start_time) * 1000)
                                    assistant_msg["thinking_duration_ms"] = thinking_ms
                            if tool_calls:
                                assistant_msg["tool_calls"] = tool_calls
                            if acc_input or acc_output:
                                assistant_msg["usage_metadata"] = {
                                    "input_tokens": acc_input,
                                    "output_tokens": acc_output,
                                    "total_tokens": acc_input + acc_output,
                                    "model": acc_model,
                                }
                                if acc_endpoint:
                                    assistant_msg["usage_metadata"]["endpoint"] = acc_endpoint
                                if acc_provider:
                                    assistant_msg["usage_metadata"]["provider"] = acc_provider
                            existing.append(assistant_msg)
                            _save_messages(thread_id, existing)
                    except (json.JSONDecodeError, KeyError):
                        pass
                yield event

        except Exception:
            # Save partial content on error
            if full_content and not any(
                m.get("role") == "assistant" and m.get("content") == full_content
                for m in existing
            ):
                assistant_msg = {
                    "role": "assistant",
                    "content": full_content,
                    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                }
                if thinking_content:
                    assistant_msg["thinking"] = thinking_content
                    if thinking_start_time is not None:
                        thinking_ms = int((time.monotonic() - thinking_start_time) * 1000)
                        assistant_msg["thinking_duration_ms"] = thinking_ms
                existing.append(assistant_msg)
                _save_messages(thread_id, existing)
            raise

        finally:
            total = acc_input + acc_output

            # Fallback for missing usage_stats [G23]
            if total == 0 and not normal_done and full_content:
                estimated = int(len(full_content) * 0.5)
                if estimated > 0:
                    logger.warning("usage_stats missing, estimating tokens: %d", estimated)
                    acc_output = estimated
                    total = estimated

            # Record token usage
            if total > 0:
                _recorded = True
                try:
                    await record_token_usage(
                        user_uid, thread_id, acc_input, acc_output, acc_model,
                        endpoint=acc_endpoint, provider=acc_provider,
                    )
                except Exception as e:
                    logger.error("Failed to record token usage: %s", e)

            # Rate limiter consumption
            if rate_limiter and total > 0:
                await rate_limiter.record_consumption(user_uid, total)

            # Request count rate limiter
            if request_rate_limiter:
                try:
                    await request_rate_limiter.record_request(user_uid)
                except Exception as e:
                    logger.warning("Failed to record request count: %s", e)

            # Send balance_update before done
            if total > 0 or balance_info:
                try:
                    balance_evt = await _build_balance_event(user_uid, acc_input, acc_output, acc_model, total)
                    if balance_evt:
                        yield f"data: {json.dumps(balance_evt, ensure_ascii=False)}\n\n"
                except Exception:
                    pass

            # Unregister thread
            await thread_registry.unregister(thread_id)

    return StreamingResponse(
        _stream_with_tracking(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _build_balance_event(
    user_uid: str,
    input_tokens: int,
    output_tokens: int,
    model: str,
    raw_total: int,
) -> dict | None:
    """Build the balance_update SSE event payload."""
    from gateway.config import get_gateway_config
    from gateway.database import get_connection
    from gateway.services.rate_limiter import rate_limiter as rl
    from gateway.services.rate_limiter import request_rate_limiter as req_rl

    db = await get_connection()
    config = get_gateway_config()

    pricing = config.get_model_pricing(model)
    billed = int(input_tokens * pricing["input_multiplier"] + output_tokens * pricing["output_multiplier"])

    row = await db.execute_fetchone(
        """
        SELECT b.plan, b.token_balance, b.plan_expires_at
        FROM user_balances b
        JOIN users u ON u.id = b.user_id
        WHERE u.uid = ?
        """,
        (user_uid,),
    )

    # Determine plan for plan-aware rate limit status
    plan = (row["plan"] if row else None) or "starter"

    rate_limit_status = {}
    if rl:
        rate_limit_status = await rl.get_status(user_uid, plan=plan)

    # Merge request count limits
    if req_rl:
        req_status = await req_rl.get_status(user_uid, plan=plan)
        rate_limit_status.update(req_status)

    event = {
        "type": "balance_update",
        "billed_tokens": billed,
        "rate_limit": rate_limit_status,
    }

    if row:
        event["plan"] = row["plan"]
        event["token_balance"] = row["token_balance"]
        event["plan_expires_at"] = row["plan_expires_at"]

    return event


@router.post("/{thread_id}/cancel")
async def cancel_thread(thread_id: str, request: Request):
    """Cancel an active streaming conversation."""
    user_uid = _get_user_uid(request)
    from gateway.services.thread_registry import thread_registry
    running = await thread_registry.get_user_running_threads(user_uid)
    if thread_id in running:
        await thread_registry.unregister(thread_id)
        return {"cancelled": True}
    return {"cancelled": False}


@router.get("/{thread_id}/export")
async def export_thread(thread_id: str, request: Request):
    """Export conversation as Markdown or JSON."""
    user_uid = _get_user_uid(request)
    store = SessionStore()
    thread = await store.get_thread(thread_id, user_uid)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    fmt = request.query_params.get("format", "markdown")

    if fmt == "json":
        return {"thread": thread, "messages": []}
    else:
        md = f"# Conversation: {thread.get('title', 'Untitled')}\n\n"
        md += f"Thread ID: {thread_id}\n"
        md += f"Created: {thread.get('created_at', 'N/A')}\n\n"
        md += "---\n\n"
        md += "_Messages would appear here_\n"
        return {"content": md, "format": "markdown"}
