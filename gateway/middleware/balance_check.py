"""Balance / subscription / status check before allowing message send."""

from __future__ import annotations

from datetime import datetime

from gateway.models.billing import BalanceError


async def check_user_balance(user_uid: str) -> dict:
    """Check user balance, subscription, and account status.

    Returns balance info dict. Raises BalanceError if not allowed.
    """
    from gateway.config import get_gateway_config
    from gateway.database import get_connection

    db = await get_connection()
    config = get_gateway_config()

    row = await db.execute_fetchone(
        """
        SELECT u.id, u.uid, u.status, u.role,
               b.plan, b.token_balance, b.plan_expires_at
        FROM users u
        LEFT JOIN user_balances b ON u.id = b.user_id
        WHERE u.uid = ?
        """,
        (user_uid,),
    )

    if not row:
        raise BalanceError("USER_NOT_FOUND", "用户不存在", 404)

    if row["status"] == "suspended":
        raise BalanceError("ACCOUNT_SUSPENDED", "账户已被暂停")
    if row["status"] == "deleted":
        raise BalanceError("ACCOUNT_DELETED", "账户已删除")

    plan = row["plan"] or "starter"

    # Auto-create balance record on first access
    if row["plan"] is None:
        try:
            from gateway.pricing_config import get_plan_config
            plan_cfg = get_plan_config("starter")
            initial = plan_cfg.get("initial_tokens", 100_000)
        except Exception:
            initial = 100_000
        await db.execute(
            "INSERT INTO user_balances (user_id, plan, token_balance, total_consumed) "
            "SELECT id, 'starter', ?, 0 FROM users WHERE uid = ?",
            (initial, user_uid),
        )
        await db.commit()
        return {
            "plan": "starter",
            "token_balance": initial,
            "is_active": True,
            "role": row["role"],
        }

    # Get concurrent limit from pricing config
    try:
        from gateway.pricing_config import get_plan_config
        plan_cfg = get_plan_config(plan)
        concurrent_limit = plan_cfg.get("max_concurrent_threads", 1)
    except Exception:
        # Fallback: pricing config unavailable, use hardcoded defaults
        _fallback = {"starter": 1, "pro": 3, "max": 5, "ultra": 10}
        concurrent_limit = _fallback.get(plan, 1)

    if plan == "starter":
        if row["token_balance"] is not None and row["token_balance"] <= 0:
            raise BalanceError(
                "INSUFFICIENT_BALANCE",
                f"Token 余额不足（当前: {row['token_balance']}），请充值",
            )
        return {
            "plan": "starter",
            "token_balance": row["token_balance"],
            "is_active": True,
            "role": row["role"],
            "concurrent_limit": concurrent_limit,
        }
    else:
        expires_at = row["plan_expires_at"]
        if expires_at:
            if isinstance(expires_at, str):
                expires_at = (
                    datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    .replace(tzinfo=None)
                )
            if expires_at < datetime.utcnow():
                raise BalanceError("SUBSCRIPTION_EXPIRED", "订阅已过期，请续费")
        return {
            "plan": plan,
            "plan_expires_at": str(expires_at) if expires_at else None,
            "is_active": True,
            "role": row["role"],
            "concurrent_limit": concurrent_limit,
        }
