"""Admin routes — user management, recharge, plan changes, force logout, stats."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from gateway.config import get_tz_offset_hours, tz_date_expr, tz_today_expr
from gateway.middleware.admin_guard import require_admin
from gateway.middleware.admin_rate_limit import check_admin_rate_limit
from gateway.models.billing import (
    AdminStatsResponse,
    AdminUserDetail,
    AdminUserItem,
    ForceLogoutRequest,
    PaginatedResponse,
    PlanChangeRequest,
    RechargeRequest,
    StatusChangeRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _admin_rate_check(request: Request):
    uid = getattr(request.state, "admin_uid", "")
    if not check_admin_rate_limit(uid):
        raise HTTPException(429, detail={"code": "ADMIN_RATE_LIMITED", "message": "管理员 API 请求过于频繁"})


# ── User List ─────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    request: Request,
    q: str = Query(default=""),
    plan: str = Query(default=""),
    status: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    """Paginated user list with optional filters."""
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    where_clauses = []
    params: list = []

    if q:
        where_clauses.append("(u.username LIKE ? OR u.email LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if plan:
        where_clauses.append("b.plan = ?")
        params.append(plan)
    if status:
        where_clauses.append("u.status = ?")
        params.append(status)

    where = " AND ".join(where_clauses) if where_clauses else "1=1"

    count_row = await db.execute_fetchone(
        f"""
        SELECT COUNT(*) as cnt FROM users u
        LEFT JOIN user_balances b ON u.id = b.user_id
        WHERE {where}
        """,
        params,
    )
    total = count_row["cnt"] if count_row else 0

    offset = (page - 1) * size
    rows = await db.execute_fetchall(
        f"""
        SELECT u.uid, u.username, u.email, u.plan, u.status, u.role,
               u.email_verified, u.created_at,
               b.token_balance, b.total_consumed, b.plan_expires_at
        FROM users u
        LEFT JOIN user_balances b ON u.id = b.user_id
        WHERE {where}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [size, offset],
    )

    items = []
    for r in rows:
        items.append({
            "uid": r["uid"],
            "username": r["username"],
            "email": r["email"],
            "plan": r["plan"] or "starter",
            "status": r["status"],
            "role": r["role"],
            "token_balance": r["token_balance"],
            "total_consumed": r["total_consumed"],
            "plan_expires_at": r["plan_expires_at"],
            "email_verified": bool(r["email_verified"]),
            "created_at": r["created_at"],
        })

    pages = (total + size - 1) // size
    return {"items": items, "total": total, "page": page, "size": size, "pages": pages}


# ── User Detail ───────────────────────────────────────────────────────────────

@router.get("/users/{uid}")
async def get_user_detail(uid: str, request: Request):
    _admin_rate_check(request)
    from gateway.database import get_connection
    from gateway.services.thread_registry import thread_registry

    db = await get_connection()
    row = await db.execute_fetchone(
        """
        SELECT u.*, b.token_balance, b.total_consumed, b.plan as balance_plan,
               b.plan_expires_at
        FROM users u
        LEFT JOIN user_balances b ON u.id = b.user_id
        WHERE u.uid = ?
        """,
        (uid,),
    )
    if not row:
        raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})

    active_threads = await thread_registry.get_running_count(uid)

    # Last login
    last_login_row = await db.execute_fetchone(
        "SELECT created_at FROM login_logs WHERE user_id = ? AND success = 1 ORDER BY created_at DESC LIMIT 1",
        (row["id"],),
    )
    login_count_row = await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM login_logs WHERE user_id = ? AND success = 1",
        (row["id"],),
    )

    return {
        "uid": row["uid"],
        "username": row["username"],
        "email": row["email"],
        "plan": row["balance_plan"] or row["plan"] or "starter",
        "status": row["status"],
        "role": row["role"],
        "token_balance": row["token_balance"],
        "total_consumed": row["total_consumed"],
        "plan_expires_at": row["plan_expires_at"],
        "email_verified": bool(row["email_verified"]),
        "created_at": row["created_at"],
        "login_count": login_count_row["cnt"] if login_count_row else 0,
        "last_login": last_login_row["created_at"] if last_login_row else None,
        "active_threads": active_threads,
    }


# ── Plan Change ───────────────────────────────────────────────────────────────

@router.put("/users/{uid}/plan")
async def change_plan(uid: str, body: PlanChangeRequest, request: Request):
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    user = await db.execute_fetchone("SELECT id FROM users WHERE uid = ?", (uid,))
    if not user:
        raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})
    user_id = user["id"]

    balance = await db.execute_fetchone(
        "SELECT plan, token_balance, plan_expires_at FROM user_balances WHERE user_id = ?",
        (user_id,),
    )
    if not balance:
        # Auto-create
        await db.execute(
            "INSERT INTO user_balances (user_id, plan, token_balance, total_consumed) VALUES (?, ?, 0, 0)",
            (user_id, body.plan.value),
        )
        await db.commit()
        return {"plan": body.plan.value}

    old_plan = balance["plan"]
    new_plan = body.plan.value

    if new_plan == "starter" and old_plan != "starter":
        # Downgrade: restore snapshot
        await db.execute(
            """UPDATE user_balances SET
                plan = 'starter',
                token_balance = COALESCE(starter_token_snapshot, 0),
                plan_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?""",
            (user_id,),
        )
    elif old_plan == "starter" and new_plan != "starter":
        # Upgrade: save snapshot
        days = body.days or 30
        expires = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        await db.execute(
            """UPDATE user_balances SET
                plan = ?,
                starter_token_snapshot = token_balance,
                plan_expires_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?""",
            (new_plan, expires, user_id),
        )
    else:
        # Same-tier or subscription-to-subscription change
        if body.days:
            expires = (datetime.utcnow() + timedelta(days=body.days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            expires = balance["plan_expires_at"]
        await db.execute(
            "UPDATE user_balances SET plan = ?, plan_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (new_plan, expires, user_id),
        )

    await db.execute("UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_plan, user_id))
    await db.commit()
    return {"plan": new_plan}


# ── Status Change ─────────────────────────────────────────────────────────────

@router.put("/users/{uid}/status")
async def change_status(uid: str, body: StatusChangeRequest, request: Request):
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    await db.execute(
        "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?",
        (body.status.value, uid),
    )
    await db.commit()
    return {"status": body.status.value}


# ── Recharge ──────────────────────────────────────────────────────────────────

@router.post("/users/{uid}/recharge")
async def recharge_user(uid: str, body: RechargeRequest, request: Request):
    _admin_rate_check(request)
    from gateway.database import get_connection

    operator_uid = getattr(request.state, "admin_uid", None)
    db = await get_connection()

    user = await db.execute_fetchone("SELECT id, uid FROM users WHERE uid = ?", (uid,))
    if not user:
        raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})
    user_id = user["id"]

    balance = await db.execute_fetchone(
        "SELECT plan, token_balance, plan_expires_at FROM user_balances WHERE user_id = ?",
        (user_id,),
    )
    if not balance:
        await db.execute(
            "INSERT INTO user_balances (user_id, plan, token_balance, total_consumed) VALUES (?, 'starter', 0, 0)",
            (user_id,),
        )
        balance = {"plan": "starter", "token_balance": 0, "plan_expires_at": None}

    plan = balance["plan"]

    if body.type == "tokens" and plan != "starter":
        raise HTTPException(400, detail={"code": "RECHARGE_TYPE_MISMATCH", "message": "订阅用户仅支持充值天数"})
    if body.type == "days" and plan == "starter":
        raise HTTPException(400, detail={"code": "RECHARGE_TYPE_MISMATCH", "message": "Starter 用户仅支持充值 Token"})

    balance_before = {"plan": plan, "token_balance": balance["token_balance"], "plan_expires_at": balance["plan_expires_at"]}

    if body.type == "tokens":
        await db.execute(
            "UPDATE user_balances SET token_balance = token_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (body.amount, user_id),
        )
        balance_after = {**balance_before, "token_balance": balance["token_balance"] + body.amount}
    else:
        current_expiry = balance["plan_expires_at"]
        if current_expiry:
            base = datetime.fromisoformat(current_expiry.replace("Z", "+00:00")).replace(tzinfo=None)
            if base < datetime.utcnow():
                base = datetime.utcnow()
        else:
            base = datetime.utcnow()
        new_expiry = base + timedelta(days=body.amount)
        new_expiry_str = new_expiry.strftime("%Y-%m-%dT%H:%M:%SZ")
        await db.execute(
            "UPDATE user_balances SET plan_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (new_expiry_str, user_id),
        )
        balance_after = {**balance_before, "plan_expires_at": new_expiry_str}

    await db.execute(
        """INSERT INTO recharge_records
           (user_id, admin_uid, type, amount, balance_before, balance_after, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (user_id, operator_uid, body.type, body.amount,
         json.dumps(balance_before), json.dumps(balance_after), body.remark),
    )
    await db.commit()
    return {"balance_before": balance_before, "balance_after": balance_after}


# ── Force Logout ──────────────────────────────────────────────────────────────

@router.post("/users/{uid}/force-logout")
async def force_logout(uid: str, body: ForceLogoutRequest, request: Request):
    _admin_rate_check(request)
    from gateway.database import get_connection
    from gateway.services.thread_registry import thread_registry

    db = await get_connection()

    user = await db.execute_fetchone("SELECT id FROM users WHERE uid = ?", (uid,))
    if not user:
        raise HTTPException(404, detail={"code": "USER_NOT_FOUND", "message": "用户不存在"})
    user_id = user["id"]

    # 1. Interrupt SSE streams
    removed_threads = await thread_registry.force_unregister_user(uid)

    # 2. Blacklist all refresh tokens
    devices = await db.execute_fetchall(
        "SELECT id, refresh_token_hash FROM user_devices WHERE user_id = ? AND is_active = 1",
        (user_id,),
    )
    expires_later = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for device in devices:
        if device["refresh_token_hash"]:
            await db.execute(
                "INSERT OR IGNORE INTO jwt_blacklist (token_hash, expires_at) VALUES (?, ?)",
                (device["refresh_token_hash"], expires_later),
            )
    await db.execute(
        "UPDATE user_devices SET is_active = 0 WHERE user_id = ?", (user_id,),
    )
    await db.commit()

    return {"removed_threads": removed_threads}


# ── Running Threads ───────────────────────────────────────────────────────────

@router.get("/threads/running")
async def get_running_threads(request: Request):
    _admin_rate_check(request)
    from gateway.services.thread_registry import thread_registry
    return {"threads": await thread_registry.get_all_running()}


# ── Recharge Statistics ────────────────────────────────────────────────────────

@router.get("/recharges/summary")
async def get_recharge_summary(
    request: Request,
    date_from: str = Query(default=""),
    date_to: str = Query(default=""),
):
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    where, params = [], []
    if date_from:
        where.append("date(r.created_at) >= ?")
        params.append(date_from)
    if date_to:
        where.append("date(r.created_at) <= ?")
        params.append(date_to)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    row = await db.execute_fetchone(
        f"""SELECT COUNT(*) as total_count,
                   COALESCE(SUM(CASE WHEN r.type='tokens' THEN r.amount ELSE 0 END), 0) as total_tokens,
                   COALESCE(SUM(CASE WHEN r.type='days' THEN r.amount ELSE 0 END), 0) as total_days
            FROM recharge_records r {clause}""",
        params,
    )
    today_row = await db.execute_fetchone(
        f"""SELECT COUNT(*) as today_count,
                  COALESCE(SUM(CASE WHEN type='tokens' THEN amount ELSE 0 END), 0) as today_tokens,
                  COALESCE(SUM(CASE WHEN type='days' THEN amount ELSE 0 END), 0) as today_days
           FROM recharge_records WHERE date(created_at) = {tz_today_expr()}""",
    )
    return {
        "total_count": row["total_count"] if row else 0,
        "total_tokens": row["total_tokens"] if row else 0,
        "total_days": row["total_days"] if row else 0,
        "today_count": today_row["today_count"] if today_row else 0,
        "today_tokens": today_row["today_tokens"] if today_row else 0,
        "today_days": today_row["today_days"] if today_row else 0,
    }


@router.get("/recharges")
async def list_recharges(
    request: Request,
    q: str = Query(default=""),
    type: str = Query(default=""),
    date_from: str = Query(default=""),
    date_to: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    where_clauses, params = [], []
    if q:
        where_clauses.append("(u.username LIKE ? OR u.email LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if type:
        where_clauses.append("r.type = ?")
        params.append(type)
    if date_from:
        where_clauses.append("date(r.created_at) >= ?")
        params.append(date_from)
    if date_to:
        where_clauses.append("date(r.created_at) <= ?")
        params.append(date_to)

    where = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    count_row = await db.execute_fetchone(
        f"SELECT COUNT(*) as cnt FROM recharge_records r LEFT JOIN users u ON r.user_id = u.id {where}",
        params,
    )
    total = count_row["cnt"] if count_row else 0

    offset = (page - 1) * size
    rows = await db.execute_fetchall(
        f"""SELECT r.id, u.username, r.type, r.amount, r.balance_before, r.balance_after,
                   r.remark, COALESCE(a.username, op.username) as operator_name, r.created_at
            FROM recharge_records r
            LEFT JOIN users u ON r.user_id = u.id
            LEFT JOIN admins a ON a.uid = r.admin_uid
            LEFT JOIN users op ON op.id = r.operator_id
            {where}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?""",
        params + [size, offset],
    )

    items = [
        {
            "id": r["id"],
            "username": r["username"],
            "type": r["type"],
            "amount": r["amount"],
            "balance_before": r["balance_before"],
            "balance_after": r["balance_after"],
            "remark": r["remark"],
            "operator_name": r["operator_name"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
    pages = (total + size - 1) // size
    return {"items": items, "total": total, "page": page, "size": size, "pages": pages}


# ── Consumption Statistics ─────────────────────────────────────────────────────

@router.get("/consumption/summary")
async def get_consumption_summary(
    request: Request,
    date_from: str = Query(default=""),
    date_to: str = Query(default=""),
):
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    where, params = [], []
    if date_from:
        where.append("date(tu.date) >= ?")
        params.append(date_from)
    if date_to:
        where.append("date(tu.date) <= ?")
        params.append(date_to)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    row = await db.execute_fetchone(
        f"""SELECT COALESCE(SUM(tu.input_tokens + tu.output_tokens), 0) as total_tokens,
                   COUNT(DISTINCT tu.user_id) as active_users
            FROM token_usage tu {clause}""",
        params,
    )
    total_tokens = row["total_tokens"] if row else 0
    active_users = row["active_users"] if row else 0
    avg = round(total_tokens / active_users) if active_users > 0 else 0
    return {"total_tokens": total_tokens, "active_users": active_users, "avg_tokens_per_user": avg}


@router.get("/consumption")
async def list_consumption(
    request: Request,
    date_from: str = Query(default=""),
    date_to: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()
    where_clauses, params = [], []
    if date_from:
        where_clauses.append("date(tu.date) >= ?")
        params.append(date_from)
    if date_to:
        where_clauses.append("date(tu.date) <= ?")
        params.append(date_to)

    where = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    count_row = await db.execute_fetchone(
        f"SELECT COUNT(DISTINCT tu.user_id) as cnt FROM token_usage tu {where}",
        params,
    )
    total = count_row["cnt"] if count_row else 0

    offset = (page - 1) * size
    rows = await db.execute_fetchall(
        f"""SELECT u.uid, u.username, COALESCE(b.plan, 'starter') as plan,
                   COALESCE(SUM(tu.input_tokens + tu.output_tokens), 0) as total_tokens,
                   COALESCE(SUM(tu.message_count), 0) as total_messages,
                   MAX(tu.date) as last_active
            FROM token_usage tu
            JOIN users u ON tu.user_id = u.id
            LEFT JOIN user_balances b ON tu.user_id = b.user_id
            {where}
            GROUP BY tu.user_id
            ORDER BY total_tokens DESC
            LIMIT ? OFFSET ?""",
        params + [size, offset],
    )

    items = [
        {
            "uid": r["uid"],
            "username": r["username"],
            "plan": r["plan"],
            "total_tokens": r["total_tokens"],
            "total_messages": r["total_messages"],
            "last_active": r["last_active"],
        }
        for r in rows
    ]
    pages = (total + size - 1) // size
    return {"items": items, "total": total, "page": page, "size": size, "pages": pages}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(request: Request):
    _admin_rate_check(request)
    from gateway.database import get_connection
    from gateway.services.thread_registry import thread_registry

    db = await get_connection()

    total_users = (await db.execute_fetchone("SELECT COUNT(*) as cnt FROM users"))["cnt"]
    active_today = (await db.execute_fetchone(
        f"SELECT COUNT(DISTINCT user_id) as cnt FROM login_logs WHERE success = 1 AND date(created_at) = {tz_today_expr()}"
    ))["cnt"]
    tokens_today_row = await db.execute_fetchone(
        f"SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage_log WHERE {tz_date_expr('created_at')} = {tz_today_expr()}"
    )
    tokens_today = tokens_today_row["total"] if tokens_today_row else 0

    # Users by plan
    plan_rows = await db.execute_fetchall(
        "SELECT b.plan, COUNT(*) as cnt FROM user_balances b GROUP BY b.plan"
    )
    users_by_plan = {r["plan"]: r["cnt"] for r in plan_rows}

    all_running = await thread_registry.get_all_running()

    return {
        "total_users": total_users,
        "active_users_today": active_today,
        "total_tokens_consumed_today": tokens_today,
        "active_threads": len(all_running),
        "users_by_plan": users_by_plan,
    }


# ── Platform Token Stats ─────────────────────────────────────────────────────

@router.get("/token-stats")
async def get_platform_token_stats(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
):
    """Platform-wide daily token usage time series with summary cards."""
    _admin_rate_check(request)
    from gateway.database import get_connection

    db = await get_connection()

    # Daily aggregated time series from token_usage table
    rows = await db.execute_fetchall(
        f"""SELECT tu.date,
                  COALESCE(SUM(tu.input_tokens), 0) as input_tokens,
                  COALESCE(SUM(tu.output_tokens), 0) as output_tokens,
                  COALESCE(SUM(tu.input_tokens + tu.output_tokens), 0) as total_tokens,
                  COALESCE(SUM(tu.message_count), 0) as message_count,
                  COUNT(DISTINCT tu.user_id) as active_users
           FROM token_usage tu
           WHERE tu.date >= {tz_date_expr("'now', ? || ' days'")}
           GROUP BY tu.date
           ORDER BY tu.date ASC""",
        (str(-(days - 1)),),
    )

    daily = [
        {
            "date": r["date"],
            "input_tokens": r["input_tokens"],
            "output_tokens": r["output_tokens"],
            "total_tokens": r["total_tokens"],
            "message_count": r["message_count"],
            "active_users": r["active_users"],
        }
        for r in rows
    ]

    # Summary: 1d, 7d, 30d
    async def _sum_for(n_days: int | None) -> dict:
        if n_days is None:
            row = await db.execute_fetchone(
                """SELECT COALESCE(SUM(input_tokens), 0) as input_tokens,
                          COALESCE(SUM(output_tokens), 0) as output_tokens,
                          COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
                          COALESCE(SUM(message_count), 0) as message_count,
                          COUNT(DISTINCT user_id) as active_users
                   FROM token_usage"""
            )
        else:
            row = await db.execute_fetchone(
                f"""SELECT COALESCE(SUM(input_tokens), 0) as input_tokens,
                          COALESCE(SUM(output_tokens), 0) as output_tokens,
                          COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
                          COALESCE(SUM(message_count), 0) as message_count,
                          COUNT(DISTINCT user_id) as active_users
                   FROM token_usage
                   WHERE date >= {tz_date_expr("'now', ? || ' days'")}""",
                (str(-(n_days - 1)),),
            )
        return {
            "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"],
            "total_tokens": row["total_tokens"],
            "message_count": row["message_count"],
            "active_users": row["active_users"],
        }

    summary_1d = await _sum_for(1)
    summary_7d = await _sum_for(7)
    summary_30d = await _sum_for(30)

    # Hourly breakdown for 1d view (24 data points, 0-23h)
    hourly: list[dict] = []
    if days == 1:
        hourly_rows = await db.execute_fetchall(
            f"""SELECT CAST(strftime('%H', tul.created_at, '{get_tz_offset_hours():+d} hours') AS INTEGER) as hour,
                    COALESCE(SUM(tul.input_tokens), 0) as input_tokens,
                    COALESCE(SUM(tul.output_tokens), 0) as output_tokens,
                    COALESCE(SUM(tul.total_tokens), 0) as total_tokens,
                    COUNT(*) as message_count,
                    COUNT(DISTINCT tul.user_id) as active_users
             FROM token_usage_log tul
             WHERE {tz_date_expr('tul.created_at')} = {tz_today_expr()}
             GROUP BY hour ORDER BY hour"""
        )
        hourly_map = {r["hour"]: dict(r) for r in hourly_rows}
        for h in range(24):
            if h in hourly_map:
                hourly.append(hourly_map[h])
            else:
                hourly.append({
                    "hour": h, "input_tokens": 0, "output_tokens": 0,
                    "total_tokens": 0, "message_count": 0, "active_users": 0,
                })

    return {
        "daily": daily,
        "hourly": hourly,
        "summary": {
            "1d": summary_1d,
            "7d": summary_7d,
            "30d": summary_30d,
        },
    }


# ── Pricing Settings ────────────────────────────────────────────────────────


@router.get("/settings/pricing")
async def get_pricing_settings(request: Request):
    """Return current pricing configuration."""
    _admin_rate_check(request)
    from gateway.pricing_config import get_pricing_config

    cfg = get_pricing_config()
    return cfg.model_dump()


@router.put("/settings/pricing")
async def update_pricing_settings(request: Request):
    """Update pricing configuration (admin only).

    Request body: full PricingConfig JSON.
    Validates with Pydantic, writes atomically, refreshes in-memory config.
    """
    _admin_rate_check(request)

    from pydantic import ValidationError

    from gateway.models.pricing import PricingConfig as PricingConfigModel
    from gateway.pricing_config import save_pricing_config

    body = await request.json()

    # Pre-validate before saving (save_pricing_config also validates, but this
    # gives cleaner error messages)
    try:
        PricingConfigModel.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    admin_uid = getattr(request.state, "admin_uid", "unknown")

    try:
        new_cfg = await save_pricing_config(body, admin_uid)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except Exception as e:
        logger.error("pricing_save_failed: %s", e)
        raise HTTPException(status_code=500, detail="保存失败，请稍后重试")

    return {"ok": True, "version": new_cfg.version}


# ── Timezone Settings ────────────────────────────────────────────────────────


@router.get("/settings/llm")
async def get_llm_settings(request: Request):
    """Return current project-level structured LLM configuration."""
    _admin_rate_check(request)

    from EvoScientist.config.model_config import load_structured_config

    cfg = load_structured_config()
    return cfg.model_dump(mode="python")


@router.put("/settings/llm")
async def update_llm_settings(request: Request):
    """Update project-level structured LLM configuration."""
    _admin_rate_check(request)

    from pydantic import ValidationError

    from EvoScientist.config.model_config import StructuredConfig, save_structured_config
    from EvoScientist.llm.models import _clear_structured_config_cache
    from gateway.routes.models import reset_model_list_cache

    body = await request.json()

    try:
        cfg = StructuredConfig.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    try:
        saved = save_structured_config(cfg)
        _clear_structured_config_cache()
        reset_model_list_cache()
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except Exception as e:
        logger.error("llm_settings_save_failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="保存失败，请稍后重试")

    logger.info(
        "llm_settings_updated by %s default_model=%s providers=%d",
        getattr(request.state, "admin_uid", "unknown"),
        saved.default_model,
        len(saved.providers),
    )
    return {"ok": True, "default_model": saved.default_model}


@router.get("/settings/timezone")
async def get_timezone_settings(request: Request):
    """Return current timezone configuration."""
    _admin_rate_check(request)
    from gateway.config import get_gateway_config

    cfg = get_gateway_config()
    return {"timezone": cfg.timezone}


@router.put("/settings/timezone")
async def update_timezone_settings(request: Request):
    """Update timezone configuration (admin only).

    Request body: {"timezone": "Asia/Shanghai"}
    Validates the timezone name and updates both in-memory and persisted config.
    """
    _admin_rate_check(request)
    from gateway.config import set_gateway_timezone

    body = await request.json()
    tz_name = body.get("timezone", "").strip()

    if not tz_name:
        raise HTTPException(status_code=422, detail="timezone is required")

    if not set_gateway_timezone(tz_name):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid timezone: {tz_name}. Use IANA timezone names like 'Asia/Shanghai', 'America/New_York'.",
        )

    logger.info("timezone_updated: %s by %s", tz_name, getattr(request.state, "admin_uid", "unknown"))
    return {"ok": True, "timezone": tz_name}
