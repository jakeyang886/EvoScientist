"""Token tracker — record usage and atomically deduct balance."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def record_token_usage(
    user_uid: str,
    thread_id: str,
    input_tokens: int,
    output_tokens: int,
    model: str,
    endpoint: str = "",
    provider: str = "",
) -> None:
    """Record token usage and deduct starter balance atomically."""
    from gateway.config import get_gateway_config
    from gateway.database import get_connection

    db = await get_connection()
    config = get_gateway_config()

    user = await db.execute_fetchone("SELECT id FROM users WHERE uid = ?", (user_uid,))
    if not user:
        return
    user_id = user["id"]

    pricing = config.get_model_pricing(model)
    billed = int(input_tokens * pricing["input_multiplier"] + output_tokens * pricing["output_multiplier"])
    raw_total = input_tokens + output_tokens

    # Detail log
    await db.execute(
        """INSERT INTO token_usage_log
           (user_id, thread_id, input_tokens, output_tokens, total_tokens, model, billed_tokens, endpoint, provider)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, thread_id, input_tokens, output_tokens, raw_total, model, billed, endpoint, provider),
    )

    # Daily aggregation — matches UNIQUE(user_id, date, model, thread_id)
    # Use configured timezone so date aligns with the user's business day
    from gateway.config import get_tz_aware_date
    today = get_tz_aware_date()
    await db.execute(
        """
        INSERT INTO token_usage (user_id, date, input_tokens, output_tokens, message_count, model, thread_id)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(user_id, date, model, thread_id) DO UPDATE SET
            input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens,
            message_count = message_count + 1
        """,
        (user_id, today, input_tokens, output_tokens, model, thread_id),
    )

    # Endpoint daily aggregation — fast endpoint stats without scanning token_usage_log
    if endpoint:
        await db.execute(
            """
            INSERT INTO endpoint_usage_daily (date, provider, endpoint, model, calls, input_tokens, output_tokens)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(date, provider, endpoint, model) DO UPDATE SET
                calls = calls + 1,
                input_tokens = input_tokens + excluded.input_tokens,
                output_tokens = output_tokens + excluded.output_tokens,
                updated_at = CURRENT_TIMESTAMP
            """,
            (today, provider or "", endpoint, model, input_tokens, output_tokens),
        )

    # Starter balance deduction — atomic SQL
    if billed > 0:
        await db.execute(
            """
            UPDATE user_balances
            SET token_balance = token_balance - ?,
                total_consumed = total_consumed + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND plan = 'starter'
            """,
            (billed, billed, user_id),
        )

    await db.commit()
