"""User management routes."""

import logging
import uuid

from fastapi import APIRouter, HTTPException, Query, Request

from gateway.config import get_tz_offset_hours, tz_date_expr, tz_today_expr

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/users/me", tags=["users"])


def _get_user_uid(request: Request) -> str:
    uid = getattr(request.state, "user_uid", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return uid


@router.get("")
async def get_user(request: Request):
    """Get current user profile."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection
    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT * FROM users WHERE uid = ?", (user_uid,))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user = dict(row)
    return {
        "uid": user["uid"],
        "username": user["username"],
        "email": user["email"],
        "avatar_url": user.get("avatar_url"),
        "plan": user.get("plan", "starter"),
        "email_verified": bool(user.get("email_verified", False)),
        "created_at": user.get("created_at"),
    }


@router.patch("")
async def update_user(request: Request):
    """Update current user profile (username, avatar)."""
    user_uid = _get_user_uid(request)
    body = await request.json()

    updates = {}
    if "username" in body:
        updates["username"] = body["username"]
    if "avatar_url" in body:
        updates["avatar_url"] = body["avatar_url"]

    if not updates:
        return {}

    from gateway.database import get_connection
    conn = await get_connection()

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_uid]
    await conn.execute(
        f"UPDATE users SET {set_clause}, updated_at = datetime('now') WHERE uid = ?",
        values,
    )
    await conn.commit()

    return await get_user(request)


@router.get("/devices")
async def get_devices(request: Request):
    """Get logged-in devices."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection
    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"devices": []}
    user_id = row["id"]
    rows = await conn.execute_fetchall(
        "SELECT device_name, ip_address, last_seen, is_active FROM user_devices WHERE user_id = ? ORDER BY last_seen DESC",
        (user_id,),
    )
    return {"devices": [dict(r) for r in rows]}


@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, request: Request):
    """Remove a device (revoke its refresh token)."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection
    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    await conn.execute("DELETE FROM user_devices WHERE id = ? AND user_id = ?", (device_id, row["id"]))
    await conn.commit()
    return {}


@router.get("/token-usage")
async def get_token_usage(
    request: Request,
    days: int = Query(default=30),
    thread_id: str | None = Query(default=None),
):
    """Get token usage stats.

    Query params:
      days:       lookback window (default 30)
      thread_id:  optional filter for a specific conversation

    Response:
      daily:    [{date, input_tokens, output_tokens, total_tokens}, ...]
      monthly:  [{month, input_tokens, output_tokens, total_tokens}, ...]
      total:    {input_tokens, output_tokens, total_tokens}
      today:    {input_tokens, output_tokens, total_tokens}
      thread:   {input_tokens, output_tokens, total_tokens}  (only if thread_id given)
    """
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"daily": [], "total": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                "today": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}}
    user_id = row["id"]

    # Build WHERE clause
    where = "user_id = ?"
    params: list = [user_id]
    if thread_id:
        where += " AND thread_id = ?"
        params.append(thread_id)
    else:
        where += " AND date >= date('now', ?)"
        params.append(f"-{days} days")

    # Daily aggregated
    daily_rows = await conn.execute_fetchall(
        f"""SELECT date,
               SUM(input_tokens) as input_tokens,
               SUM(output_tokens) as output_tokens,
               SUM(input_tokens + output_tokens) as total_tokens,
               SUM(COALESCE(message_count, 0)) as message_count
           FROM token_usage WHERE {where}
           GROUP BY date ORDER BY date DESC""",
        params,
    )
    daily = [dict(r) for r in daily_rows]

    # Total (all time, consistent with monthly)
    total_where = "user_id = ?"
    total_params: list = [user_id]
    if thread_id:
        total_where += " AND thread_id = ?"
        total_params.append(thread_id)
    total_row = await conn.execute_fetchone(
        f"""SELECT COALESCE(SUM(input_tokens),0) as input_tokens,
               COALESCE(SUM(output_tokens),0) as output_tokens,
               COALESCE(SUM(input_tokens + output_tokens),0) as total_tokens,
               COALESCE(SUM(message_count),0) as message_count
           FROM token_usage WHERE {total_where}""",
        total_params,
    )

    # Today's usage
    today_params = [user_id]
    today_where = f"user_id = ? AND date = {tz_today_expr()}"
    if thread_id:
        today_where += " AND thread_id = ?"
        today_params.append(thread_id)
    today_row = await conn.execute_fetchone(
        f"""SELECT COALESCE(SUM(input_tokens),0) as input_tokens,
               COALESCE(SUM(output_tokens),0) as output_tokens,
               COALESCE(SUM(input_tokens + output_tokens),0) as total_tokens,
               COALESCE(SUM(message_count),0) as message_count
           FROM token_usage WHERE {today_where}""",
        today_params,
    )

    # Monthly aggregated (all time)
    monthly_where = "user_id = ?"
    monthly_params: list = [user_id]
    if thread_id:
        monthly_where += " AND thread_id = ?"
        monthly_params.append(thread_id)
    monthly_rows = await conn.execute_fetchall(
        f"""SELECT strftime('%Y-%m', date) as month,
               SUM(input_tokens) as input_tokens,
               SUM(output_tokens) as output_tokens,
               SUM(input_tokens + output_tokens) as total_tokens,
               SUM(COALESCE(message_count, 0)) as message_count
           FROM token_usage WHERE {monthly_where}
           GROUP BY month ORDER BY month DESC""",
        monthly_params,
    )
    monthly = [dict(r) for r in monthly_rows]

    result: dict = {
        "daily": daily,
        "monthly": monthly,
        "total": dict(total_row) if total_row else {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0},
        "today": dict(today_row) if today_row else {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0},
    }

    # Thread-specific usage (all time, not limited by days)
    if thread_id:
        thread_row = await conn.execute_fetchone(
            """SELECT COALESCE(SUM(input_tokens),0) as input_tokens,
                   COALESCE(SUM(output_tokens),0) as output_tokens,
                   COALESCE(SUM(input_tokens + output_tokens),0) as total_tokens,
                   COALESCE(SUM(message_count),0) as message_count
               FROM token_usage WHERE user_id = ? AND thread_id = ?""",
            (user_id, thread_id),
        )
        result["thread"] = dict(thread_row) if thread_row else {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0}

    return result


@router.get("/token-usage/threads")
async def get_token_usage_threads(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
):
    """Get token usage aggregated per thread (conversation).

    Returns a list of threads sorted by total token usage (descending),
    with the thread title fetched from sessions.db.

    Query params:
      limit: max number of threads to return (default 50)

    Response:
      threads: [{thread_id, title, input_tokens, output_tokens, total_tokens, model, last_used}, ...]
    """
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"threads": []}
    user_id = row["id"]

    # Aggregate token_usage by thread_id
    rows = await conn.execute_fetchall(
        """SELECT thread_id,
                  SUM(input_tokens) as input_tokens,
                  SUM(output_tokens) as output_tokens,
                  SUM(input_tokens + output_tokens) as total_tokens,
                  SUM(COALESCE(message_count, 0)) as message_count,
                  MAX(model) as model,
                  MAX(date) as last_used
           FROM token_usage
           WHERE user_id = ? AND thread_id IS NOT NULL AND thread_id != ''
           GROUP BY thread_id
           ORDER BY total_tokens DESC
           LIMIT ?""",
        (user_id, limit),
    )
    thread_usage = [dict(r) for r in rows]

    # Enrich with thread titles from sessions.db
    thread_ids = [t["thread_id"] for t in thread_usage]
    title_map: dict[str, str] = {}
    if thread_ids:
        try:
            from gateway.services.session_store import SessionStore
            store = SessionStore()
            for tid in thread_ids:
                thread_info = await store.get_thread(tid, user_uid)
                if thread_info:
                    title_map[tid] = thread_info.get("title", "Untitled")
        except Exception:
            pass

    for t in thread_usage:
        t["title"] = title_map.get(t["thread_id"], "Untitled")

    return {"threads": thread_usage}


@router.get("/token-usage/hourly")
async def get_token_usage_hourly(
    request: Request,
    date: str | None = Query(default=None),
    thread_id: str | None = Query(default=None),
):
    """Get hourly token usage for a specific date (default: today).

    Aggregates from token_usage_log which has per-call timestamps.

    Query params:
      date:      ISO date string (YYYY-MM-DD), defaults to today
      thread_id: optional filter for a specific conversation

    Response:
      date:   "YYYY-MM-DD"
      hourly: [{hour, input_tokens, output_tokens, total_tokens, message_count}, ...]
               hour is 0-23 (always returns all 24 hours)
      summary: {input_tokens, output_tokens, total_tokens, message_count}
    """
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"date": date or "today", "hourly": [], "summary": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0}}
    user_id = row["id"]

    target_date = date or tz_today_expr()

    # Build WHERE clause
    where_parts = ["tul.user_id = ?"]
    params: list = [user_id]

    if date:
        where_parts.append(f"{tz_date_expr('tul.created_at')} = ?")
        params.append(date)
    else:
        where_parts.append(f"{tz_date_expr('tul.created_at')} = {tz_today_expr()}")

    if thread_id:
        where_parts.append("tul.thread_id = ?")
        params.append(thread_id)

    where = " AND ".join(where_parts)

    # Hourly aggregated from log table (shift hours to local timezone)
    tz_offset = get_tz_offset_hours()
    hourly_rows = await conn.execute_fetchall(
        f"""SELECT CAST(strftime('%H', tul.created_at, '{tz_offset:+d} hours') AS INTEGER) as hour,
               COALESCE(SUM(tul.input_tokens), 0) as input_tokens,
               COALESCE(SUM(tul.output_tokens), 0) as output_tokens,
               COALESCE(SUM(tul.total_tokens), 0) as total_tokens,
               COUNT(*) as message_count
           FROM token_usage_log tul WHERE {where}
           GROUP BY hour ORDER BY hour""",
        params,
    )
    hourly_map = {r["hour"]: dict(r) for r in hourly_rows}

    # Fill all 24 hours (0-23)
    hourly = []
    for h in range(24):
        if h in hourly_map:
            hourly.append(hourly_map[h])
        else:
            hourly.append({"hour": h, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0})

    # Summary
    summary = {
        "input_tokens": sum(h["input_tokens"] for h in hourly),
        "output_tokens": sum(h["output_tokens"] for h in hourly),
        "total_tokens": sum(h["total_tokens"] for h in hourly),
        "message_count": sum(h["message_count"] for h in hourly),
    }

    # Resolve date string for response
    date_str = date
    if not date_str:
        date_row = await conn.execute_fetchone(f"SELECT {tz_today_expr()} as d")
        date_str = date_row["d"] if date_row else "today"

    return {"date": date_str, "hourly": hourly, "summary": summary}


@router.get("/token-usage/7d-hourly")
async def get_token_usage_7d_hourly(
    request: Request,
    thread_id: str | None = Query(default=None),
):
    """Get hourly token usage for the last 7 days, grouped by day.

    Returns:
      days: [{date, hourly: [{hour, input_tokens, output_tokens, total_tokens, message_count}]}]
             7 entries (most recent last), each with 24 hours
      summary_7d: {input_tokens, output_tokens, total_tokens, message_count}
    """
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"days": [], "summary_7d": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0}}
    user_id = row["id"]

    # Build WHERE clause (timezone-aware date comparisons)
    _expr_col = tz_date_expr('tul.created_at')
    _expr_7d_ago = tz_date_expr("'now'", "-6 days")
    _expr_today = tz_today_expr()
    where_parts = [
        "tul.user_id = ?",
        f"{_expr_col} >= {_expr_7d_ago}",
        f"{_expr_col} <= {_expr_today}",
    ]
    params: list = [user_id]

    if thread_id:
        where_parts.append("tul.thread_id = ?")
        params.append(thread_id)

    where = " AND ".join(where_parts)

    # Aggregate by date + hour (timezone-aware)
    tz_offset = get_tz_offset_hours()
    rows = await conn.execute_fetchall(
        f"""SELECT {tz_date_expr('tul.created_at')} as d,
               CAST(strftime('%H', tul.created_at, '{tz_offset:+d} hours') AS INTEGER) as hour,
               COALESCE(SUM(tul.input_tokens), 0) as input_tokens,
               COALESCE(SUM(tul.output_tokens), 0) as output_tokens,
               COALESCE(SUM(tul.total_tokens), 0) as total_tokens,
               COUNT(*) as message_count
           FROM token_usage_log tul WHERE {where}
           GROUP BY d, hour ORDER BY d, hour""",
        params,
    )

    # Organize into day -> hour map
    day_map: dict[str, dict[int, dict]] = {}
    for r in rows:
        d = r["d"]
        if d not in day_map:
            day_map[d] = {}
        day_map[d][r["hour"]] = dict(r)

    # Build 7-day list (timezone-aware date generation)
    _d = [tz_date_expr("'now'", f"-{i} days") for i in range(6, 0, -1)] + [tz_today_expr()]
    date_sql = " UNION ALL ".join(f"SELECT {e}" + (" as d" if i == 0 else "") for i, e in enumerate(_d))
    date_rows = await conn.execute_fetchall(date_sql)
    dates = [r["d"] for r in date_rows]

    days = []
    for d in dates:
        hour_map = day_map.get(d, {})
        hourly = []
        for h in range(24):
            if h in hour_map:
                hourly.append(hour_map[h])
            else:
                hourly.append({"hour": h, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "message_count": 0})
        days.append({"date": d, "hourly": hourly})

    summary_7d = {
        "input_tokens": sum(
            h["input_tokens"] for day in days for h in day["hourly"]
        ),
        "output_tokens": sum(
            h["output_tokens"] for day in days for h in day["hourly"]
        ),
        "total_tokens": sum(
            h["total_tokens"] for day in days for h in day["hourly"]
        ),
        "message_count": sum(
            h["message_count"] for day in days for h in day["hourly"]
        ),
    }

    return {"days": days, "summary_7d": summary_7d}


@router.get("/token-usage/records")
async def get_token_usage_records(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    thread_id: str | None = Query(default=None),
):
    """Get individual token usage records (each API call = one row).

    Query params:
      limit:     max records to return (default 50, max 200)
      offset:    pagination offset
      thread_id: optional filter for a specific conversation

    Response:
      records: [{id, thread_id, title, model, input_tokens, output_tokens, total_tokens, created_at}, ...]
      total:   total count of matching records
    """
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"records": [], "total": 0}
    user_id = row["id"]

    # Build WHERE
    where = "user_id = ?"
    params: list = [user_id]
    if thread_id:
        where += " AND thread_id = ?"
        params.append(thread_id)

    # Count total
    count_row = await conn.execute_fetchone(
        f"SELECT COUNT(*) as cnt FROM token_usage_log WHERE {where}", params
    )
    total = count_row["cnt"] if count_row else 0

    # Fetch records
    rows = await conn.execute_fetchall(
        f"""SELECT id, thread_id, model, input_tokens, output_tokens, total_tokens, created_at
           FROM token_usage_log WHERE {where}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?""",
        params + [limit, offset],
    )
    records = [dict(r) for r in rows]

    # Enrich with thread titles
    thread_ids = list({r["thread_id"] for r in records if r.get("thread_id")})
    title_map: dict[str, str] = {}
    if thread_ids:
        try:
            from gateway.services.session_store import SessionStore
            store = SessionStore()
            for tid in thread_ids:
                thread_info = await store.get_thread(tid, user_uid)
                if thread_info:
                    title_map[tid] = thread_info.get("title", "Untitled")
        except Exception:
            pass

    for r in records:
        r["title"] = title_map.get(r.get("thread_id", ""), "Untitled")

    return {"records": records, "total": total}


@router.get("/login-logs")
async def get_login_logs(request: Request, limit: int = Query(default=20)):
    """Get recent login activity."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection
    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"logs": []}
    user_id = row["id"]
    rows = await conn.execute_fetchall(
        """SELECT ip_address, user_agent, success, created_at FROM login_logs
           WHERE user_id = ? ORDER BY created_at DESC LIMIT ?""",
        (user_id, limit),
    )
    return {"logs": [dict(r) for r in rows]}


@router.get("/invite-codes")
async def get_invite_codes(request: Request):
    """Get user's invite codes."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection
    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        return {"codes": []}
    user_id = row["id"]
    rows = await conn.execute_fetchall(
        "SELECT code, uses, max_uses, created_at FROM invite_codes WHERE created_by = ?",
        (user_id,),
    )
    return {"codes": [dict(r) for r in rows]}


@router.post("/invite-codes")
async def create_invite_code(request: Request):
    """Generate a new invite code."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection
    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    code = uuid.uuid4().hex[:8].upper()
    body = await request.json()
    max_uses = body.get("max_uses", 1) if body else 1

    await conn.execute(
        "INSERT INTO invite_codes (code, created_by, max_uses) VALUES (?, ?, ?)",
        (code, row["id"], max_uses),
    )
    await conn.commit()
    return {"code": code}


@router.post("/delete")
async def delete_account(request: Request):
    """Request account deletion (cascades to all data)."""
    user_uid = _get_user_uid(request)
    body = await request.json()
    password = body.get("password", "")

    from gateway.database import get_connection
    from gateway.utils.password import verify_password

    conn = await get_connection()
    row = await conn.execute_fetchone("SELECT * FROM users WHERE uid = ?", (user_uid,))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    user = dict(row)
    if not verify_password(password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")

    # Create deletion record
    await conn.execute(
        "INSERT INTO account_deletions (user_id, status) VALUES (?, 'pending')",
        (user["id"],),
    )
    await conn.commit()

    # In production, this would trigger async cascading deletion
    logger.info("Account deletion requested for user %s", user_uid)
    return {}


@router.get("/settings")
async def get_settings(request: Request):
    """Get user settings."""
    return {
        "theme": "system",
        "language": "zh-CN",
        "model": "claude-sonnet-4-6",
        "reasoning_effort": "medium",
    }


@router.put("/settings")
async def update_settings(request: Request):
    """Update user settings."""
    body = await request.json()
    # In production, persist to database
    return {}


# ── Balance / Recharge / Rate Limit ──────────────────────────────────────────


@router.get("/balance")
async def get_balance(request: Request):
    """Get current user's balance, plan, and subscription status."""
    user_uid = _get_user_uid(request)
    from gateway.config import get_gateway_config
    from gateway.database import get_connection

    db = await get_connection()
    config = get_gateway_config()

    row = await db.execute_fetchone(
        """
        SELECT u.status, u.role, b.plan, b.token_balance, b.plan_expires_at, b.total_consumed
        FROM users u
        LEFT JOIN user_balances b ON u.id = b.user_id
        WHERE u.uid = ?
        """,
        (user_uid,),
    )
    if not row:
        raise HTTPException(404, detail="User not found")

    plan = row["plan"] or "starter"

    # Get concurrent limit from pricing config
    try:
        from gateway.pricing_config import get_plan_config
        plan_cfg = get_plan_config(plan)
        concurrent_limit = plan_cfg.get("max_concurrent_threads", 1)
    except Exception:
        from gateway.config import get_gateway_config
        concurrent_limit = get_gateway_config().thread_limits.get(plan, 1)

    return {
        "plan": plan,
        "role": row["role"],
        "token_balance": row["token_balance"],
        "total_consumed": row["total_consumed"],
        "plan_expires_at": row["plan_expires_at"],
        "is_active": row["status"] == "active",
        "concurrent_limit": concurrent_limit,
    }


@router.get("/recharge-records")
async def get_recharge_records(
    request: Request,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    """Get paginated recharge history for current user."""
    user_uid = _get_user_uid(request)
    from gateway.database import get_connection

    db = await get_connection()
    user = await db.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not user:
        return {"items": [], "total": 0, "page": page, "size": size, "pages": 0}
    user_id = user["id"]

    total = (await db.execute_fetchone(
        "SELECT COUNT(*) as cnt FROM recharge_records WHERE user_id = ?", (user_id,)
    ))["cnt"]

    offset = (page - 1) * size
    rows = await db.execute_fetchall(
        """SELECT r.id, r.type, r.amount, r.balance_before, r.balance_after, r.remark, r.created_at,
                  COALESCE(a.username, op.username) as operator_name
           FROM recharge_records r
           LEFT JOIN admins a ON a.uid = r.admin_uid
           LEFT JOIN users op ON op.id = r.operator_id
           WHERE r.user_id = ?
           ORDER BY r.created_at DESC
           LIMIT ? OFFSET ?""",
        (user_id, size, offset),
    )

    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "type": r["type"],
            "amount": r["amount"],
            "balance_before": r["balance_before"],
            "balance_after": r["balance_after"],
            "remark": r["remark"],
            "operator_name": r["operator_name"],
            "created_at": r["created_at"],
        })

    pages = (total + size - 1) // size
    return {"items": items, "total": total, "page": page, "size": size, "pages": pages}


@router.get("/rate-limit-status")
async def get_rate_limit_status(request: Request):
    """Get current rate limit usage for the user."""
    user_uid = _get_user_uid(request)
    from gateway.services.rate_limiter import rate_limiter, request_rate_limiter

    if not rate_limiter:
        return {"minute_used": 0, "minute_limit": 0, "day_used": 0, "day_limit": 0}

    # Get user plan for plan-aware limits
    try:
        from gateway.database import get_connection
        db = await get_connection()
        plan_row = await db.execute_fetchone(
            "SELECT b.plan FROM user_balances b JOIN users u ON u.id = b.user_id WHERE u.uid = ?",
            (user_uid,),
        )
        plan = (plan_row["plan"] if plan_row else None) or "starter"
    except Exception:
        plan = "starter"

    status = await rate_limiter.get_status(user_uid, plan=plan)

    # Merge request count limits
    if request_rate_limiter:
        req_status = await request_rate_limiter.get_status(user_uid, plan=plan)
        status.update(req_status)

    return status
