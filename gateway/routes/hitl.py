"""HITL (Human-In-The-Loop) routes."""

import logging

from fastapi import APIRouter, HTTPException, Request

from gateway.models.hitl import InterruptAnswer, InterruptApproval

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threads/{thread_id}/interrupt/{interrupt_id}", tags=["hitl"])


@router.post("")
async def handle_interrupt(thread_id: str, interrupt_id: str, request: Request):
    """Handle HITL interrupt — approve/deny or answer."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    body = await request.json()

    if "approved" in body:
        # Approval response
        approved = body["approved"]
        logger.info("HITL %s %s by user %s", "approved" if approved else "denied", interrupt_id, user_uid)
        # In full implementation, this would resume the agent with the approval result
        return {}
    elif "answer" in body:
        # Answer response
        answer = body["answer"]
        logger.info("HITL answer for %s by user %s: %s", interrupt_id, user_uid, answer)
        return {}
    else:
        raise HTTPException(status_code=400, detail="Expected 'approved' or 'answer' in request body")
