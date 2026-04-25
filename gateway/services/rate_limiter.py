"""RateLimiter — async fixed-window rate limiters for token consumption and request counts.

Two independent limiters:
  1. RateLimiter       — tracks token volume per minute / per day (existing)
  2. RequestRateLimiter — tracks request counts per 5h / per week (new)

Both read limits dynamically from gateway.pricing_config per plan.
Null limits in pricing config mean "unlimited" (check always passes).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class WindowCounter:
    window_start: float = 0.0
    count: int = 0


# ═══════════════════════════════════════════════════════════════════════════════
# Token RateLimiter (token volume — per minute / per day)
# ═══════════════════════════════════════════════════════════════════════════════

class RateLimiter:
    """Async fixed-window rate limiter for token consumption.

    Reads limits dynamically from pricing config per plan.
    All rate limit parameters are configured via gateway/pricing.json (admin API).
    """

    def __init__(self):
        self._minute_counters: dict[str, WindowCounter] = defaultdict(WindowCounter)
        self._day_counters: dict[str, WindowCounter] = defaultdict(WindowCounter)
        self._lock = asyncio.Lock()

    def _get_limits(self, plan: str | None = None) -> tuple[int | None, int | None]:
        """Read token limits from pricing config for the given plan.

        Returns (per_minute, per_day). None means unlimited.
        All values come from pricing.json — no hardcoded fallback.
        """
        try:
            from gateway.pricing_config import get_plan_config
            plan_cfg = get_plan_config(plan or "starter")
            rl = plan_cfg["rate_limits"]
            return rl.get("tokens_per_minute"), rl.get("tokens_per_day")
        except Exception:
            # pricing.json unavailable — allow all (will be caught by balance check)
            return None, None

    async def check(self, user_uid: str, plan: str | None = None) -> tuple[bool, str, int]:
        """Check rate limit. Returns (allowed, reason, retry_after_seconds)."""
        from datetime import datetime, timedelta

        now = time.time()
        today = datetime.utcnow().strftime("%Y-%m-%d")

        per_minute, per_day = self._get_limits(plan)

        async with self._lock:
            if per_minute is not None:
                minute_key = f"{user_uid}:{int(now // 60)}"
                mc = self._minute_counters[minute_key]
                if mc.count >= per_minute:
                    retry_after = 60 - (now - (int(now // 60) * 60))
                    return False, "RATE_LIMITED_PER_MINUTE", int(max(1, retry_after))

            if per_day is not None:
                day_key = f"{user_uid}:{today}"
                dc = self._day_counters[day_key]
                if dc.count >= per_day:
                    tomorrow = (
                        datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                        + timedelta(days=1)
                    )
                    retry_after = (tomorrow - datetime.utcnow()).total_seconds()
                    return False, "RATE_LIMITED_PER_DAY", int(max(1, retry_after))

            return True, "", 0

    async def record_consumption(self, user_uid: str, tokens: int) -> None:
        from datetime import datetime

        now = time.time()
        today = datetime.utcnow().strftime("%Y-%m-%d")

        async with self._lock:
            minute_key = f"{user_uid}:{int(now // 60)}"
            mc = self._minute_counters[minute_key]
            mc.count += tokens
            if mc.window_start == 0:
                mc.window_start = now

            day_key = f"{user_uid}:{today}"
            self._day_counters[day_key].count += tokens

    async def get_status(self, user_uid: str, plan: str | None = None) -> dict:
        from datetime import datetime

        now = time.time()
        today = datetime.utcnow().strftime("%Y-%m-%d")

        per_minute, per_day = self._get_limits(plan)

        async with self._lock:
            minute_key = f"{user_uid}:{int(now // 60)}"
            mc = self._minute_counters.get(minute_key)
            day_key = f"{user_uid}:{today}"
            dc = self._day_counters.get(day_key)

            return {
                "minute_used": mc.count if mc else 0,
                "minute_limit": per_minute,
                "day_used": dc.count if dc else 0,
                "day_limit": per_day,
            }

    async def cold_start_from_db(self, db) -> None:
        """Restore today's counters from token_usage_log on startup. [G2]"""
        from datetime import datetime

        now = datetime.utcnow()
        today_str = now.strftime("%Y-%m-%d")

        rows = await db.execute_fetchall(
            """
            SELECT u.uid, COALESCE(SUM(t.total_tokens), 0) as total
            FROM token_usage_log t
            JOIN users u ON u.id = t.user_id
            WHERE t.created_at >= ?
            GROUP BY u.uid
            """,
            (today_str,),
        )
        async with self._lock:
            for row in rows:
                day_key = f"{row['uid']}:{today_str}"
                self._day_counters[day_key].count = row["total"]
                logger.info(
                    "RateLimiter cold start: user=%s day_used=%d", row["uid"], row["total"]
                )
        logger.info("RateLimiter cold start completed")

    async def cleanup_stale_counters(self) -> int:
        """Remove expired minute/day counters to bound memory growth."""
        from datetime import datetime

        now = time.time()
        today = datetime.utcnow().strftime("%Y-%m-%d")
        cleaned = 0
        async with self._lock:
            stale_days = [k for k in self._day_counters if not k.endswith(today)]
            for k in stale_days:
                del self._day_counters[k]
                cleaned += 1

            current_minute = int(now // 60)
            stale_minutes = [
                k for k in self._minute_counters
                if int(k.split(":")[-1]) < current_minute - 5
            ]
            for k in stale_minutes:
                del self._minute_counters[k]
                cleaned += 1
        return cleaned


# ═══════════════════════════════════════════════════════════════════════════════
# Request RateLimiter (request counts — per 5h / per week)
# ═══════════════════════════════════════════════════════════════════════════════

class RequestRateLimiter:
    """Async fixed-window rate limiter for request counts.

    Two windows:
      - 5-hour window:  window_5h = int(now // (5 * 3600))
      - 7-day window:   week_start = Monday of current week

    Reads limits from pricing config per plan. None = unlimited.
    """

    def __init__(self):
        self._5h_counters: dict[str, WindowCounter] = defaultdict(WindowCounter)
        self._week_counters: dict[str, WindowCounter] = defaultdict(WindowCounter)
        self._lock = asyncio.Lock()

    def _get_limits(self, plan: str | None = None) -> tuple[int | None, int | None]:
        """Read request count limits from pricing config."""
        try:
            from gateway.pricing_config import get_plan_config
            plan_cfg = get_plan_config(plan or "starter")
            rl = plan_cfg["rate_limits"]
            return rl.get("requests_per_5h"), rl.get("requests_per_week")
        except Exception:
            return None, None  # default: unlimited

    @staticmethod
    def _week_start_key() -> str:
        """Return the Monday date string for the current week (UTC)."""
        from datetime import datetime, timedelta

        today = datetime.utcnow().date()
        monday = today - timedelta(days=today.weekday())
        return monday.isoformat()

    async def check(self, user_uid: str, plan: str | None = None) -> tuple[bool, str, int]:
        """Check request count limits. Returns (allowed, reason, retry_after_seconds)."""
        now = time.time()
        per_5h, per_week = self._get_limits(plan)

        async with self._lock:
            if per_5h is not None:
                window_5h = int(now // (5 * 3600))
                key_5h = f"{user_uid}:{window_5h}"
                c5h = self._5h_counters[key_5h]
                if c5h.count >= per_5h:
                    # Time remaining in this 5h window
                    window_end = (window_5h + 1) * 5 * 3600
                    retry_after = max(1, int(window_end - now))
                    return False, "RATE_LIMITED_REQUESTS_5H", retry_after

            if per_week is not None:
                week_key = f"{user_uid}:{self._week_start_key()}"
                cw = self._week_counters[week_key]
                if cw.count >= per_week:
                    from datetime import datetime, timedelta

                    today = datetime.utcnow().date()
                    next_monday = today - timedelta(days=today.weekday()) + timedelta(days=7)
                    next_monday_dt = datetime(
                        next_monday.year, next_monday.month, next_monday.day
                    )
                    retry_after = max(1, int((next_monday_dt - datetime.utcnow()).total_seconds()))
                    return False, "RATE_LIMITED_REQUESTS_WEEK", retry_after

            return True, "", 0

    async def record_request(self, user_uid: str) -> None:
        """Increment request counters for both windows."""
        now = time.time()
        async with self._lock:
            window_5h = int(now // (5 * 3600))
            key_5h = f"{user_uid}:{window_5h}"
            self._5h_counters[key_5h].count += 1

            week_key = f"{user_uid}:{self._week_start_key()}"
            self._week_counters[week_key].count += 1

    async def get_status(self, user_uid: str, plan: str | None = None) -> dict:
        """Return current request count usage."""
        now = time.time()
        per_5h, per_week = self._get_limits(plan)

        async with self._lock:
            window_5h = int(now // (5 * 3600))
            key_5h = f"{user_uid}:{window_5h}"
            c5h = self._5h_counters.get(key_5h)

            week_key = f"{user_uid}:{self._week_start_key()}"
            cw = self._week_counters.get(week_key)

            return {
                "requests_5h_used": c5h.count if c5h else 0,
                "requests_5h_limit": per_5h,
                "requests_week_used": cw.count if cw else 0,
                "requests_week_limit": per_week,
            }

    async def cold_start_from_db(self, db) -> None:
        """Restore counters from token_usage_log on startup.

        Count distinct thread_id (≈ requests) per user in the last 5h / 7 days.
        """
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        now_ts = now.timestamp()
        five_hours_ago = (now - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S")
        seven_days_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

        # 5h window
        rows_5h = await db.execute_fetchall(
            """
            SELECT u.uid, COUNT(*) as cnt
            FROM token_usage_log t
            JOIN users u ON u.id = t.user_id
            WHERE t.created_at >= ?
            GROUP BY u.uid
            """,
            (five_hours_ago,),
        )

        # 7-day window
        rows_week = await db.execute_fetchall(
            """
            SELECT u.uid, COUNT(*) as cnt
            FROM token_usage_log t
            JOIN users u ON u.id = t.user_id
            WHERE t.created_at >= ?
            GROUP BY u.uid
            """,
            (seven_days_ago,),
        )

        async with self._lock:
            window_5h = int(now_ts // (5 * 3600))
            for row in rows_5h:
                key = f"{row['uid']}:{window_5h}"
                self._5h_counters[key].count = row["cnt"]
                logger.info(
                    "RequestRateLimiter cold start: user=%s 5h_requests=%d",
                    row["uid"], row["cnt"],
                )

            week_key_str = self._week_start_key()
            for row in rows_week:
                key = f"{row['uid']}:{week_key_str}"
                self._week_counters[key].count = row["cnt"]
                logger.info(
                    "RequestRateLimiter cold start: user=%s week_requests=%d",
                    row["uid"], row["cnt"],
                )

        logger.info("RequestRateLimiter cold start completed")

    async def cleanup_stale_counters(self) -> int:
        """Remove expired 5h and week counters."""
        from datetime import datetime, timedelta

        now = time.time()
        current_5h_window = int(now // (5 * 3600))
        today = datetime.utcnow().date()
        current_monday = today - timedelta(days=today.weekday())
        current_week_key = current_monday.isoformat()

        cleaned = 0
        async with self._lock:
            stale_5h = [
                k for k in self._5h_counters
                if int(k.split(":")[-1]) < current_5h_window - 1
            ]
            for k in stale_5h:
                del self._5h_counters[k]
                cleaned += 1

            stale_weeks = [
                k for k in self._week_counters
                if not k.endswith(current_week_key)
            ]
            for k in stale_weeks:
                del self._week_counters[k]
                cleaned += 1

        return cleaned


# ═══════════════════════════════════════════════════════════════════════════════
# Module-level singletons
# ═══════════════════════════════════════════════════════════════════════════════

rate_limiter: RateLimiter | None = None
request_rate_limiter: RequestRateLimiter | None = None


def init_rate_limiter() -> RateLimiter:
    global rate_limiter
    rate_limiter = RateLimiter()
    return rate_limiter


def init_request_rate_limiter() -> RequestRateLimiter:
    global request_rate_limiter
    request_rate_limiter = RequestRateLimiter()
    return request_rate_limiter
