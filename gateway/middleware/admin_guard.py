"""Admin route guard — verify admin scope for /api/admin/* endpoints.

Now relies on AdminAuthMiddleware which has already verified the JWT scope.
This dependency simply extracts admin_uid from request.state.
"""
from __future__ import annotations

from fastapi import HTTPException, Request


async def require_admin(request: Request) -> dict:
    """FastAPI dependency: extract admin identity from request state.

    AdminAuthMiddleware has already verified the JWT scope='admin'
    and injected request.state.admin_uid.
    """
    admin_uid = getattr(request.state, "admin_uid", None)
    if not admin_uid:
        raise HTTPException(403, detail={"code": "ADMIN_REQUIRED", "message": "需要管理员权限"})
    return {"uid": admin_uid, "role": "admin"}
