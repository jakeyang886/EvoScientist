"""Billing-related Pydantic models and error types."""

from __future__ import annotations

from enum import Enum
from typing import Generic, List, Optional, TypeVar

from fastapi import HTTPException
from pydantic import BaseModel, Field

# ── Enums ──────────────────────────────────────────────────────────────────────

class PlanType(str, Enum):
    starter = "starter"
    pro = "pro"
    max = "max"
    ultra = "ultra"


class UserStatus(str, Enum):
    active = "active"
    suspended = "suspended"
    deleted = "deleted"


class UserRole(str, Enum):
    user = "user"
    admin = "admin"


# ── Error ──────────────────────────────────────────────────────────────────────

class BalanceError(HTTPException):
    def __init__(self, code: str, message: str, status: int = 403):
        super().__init__(
            status_code=status,
            detail={"code": code, "message": message, "status": status},
        )


# ── User-facing Response Models ────────────────────────────────────────────────

class BalanceResponse(BaseModel):
    plan: PlanType
    role: UserRole
    token_balance: Optional[int] = None
    plan_expires_at: Optional[str] = None
    is_active: bool
    concurrent_limit: int
    total_consumed: Optional[int] = None


class RechargeRecordResponse(BaseModel):
    id: int
    type: str
    amount: int
    balance_before: Optional[str] = None
    balance_after: Optional[str] = None
    remark: Optional[str] = None
    operator_name: Optional[str] = None
    created_at: str


class RateLimitStatusResponse(BaseModel):
    minute_used: int
    minute_limit: int
    day_used: int
    day_limit: int


# ── Admin Request Models ──────────────────────────────────────────────────────

class RechargeRequest(BaseModel):
    type: str = Field(..., pattern=r"^(tokens|days)$")
    amount: int = Field(..., gt=0)
    remark: Optional[str] = None


class PlanChangeRequest(BaseModel):
    plan: PlanType
    days: Optional[int] = None


class StatusChangeRequest(BaseModel):
    status: UserStatus


class ForceLogoutRequest(BaseModel):
    reason: Optional[str] = None


# ── Admin Response Models ─────────────────────────────────────────────────────

class AdminUserItem(BaseModel):
    uid: str
    username: str
    email: str
    plan: PlanType
    status: UserStatus
    role: UserRole
    token_balance: Optional[int] = None
    total_consumed: Optional[int] = None
    plan_expires_at: Optional[str] = None
    email_verified: bool
    created_at: str


class AdminUserDetail(AdminUserItem):
    login_count: Optional[int] = None
    last_login: Optional[str] = None
    active_threads: int = 0


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users_today: int
    total_tokens_consumed_today: int
    active_threads: int
    users_by_plan: dict[str, int]


# ── Generic Pagination ────────────────────────────────────────────────────────

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int
