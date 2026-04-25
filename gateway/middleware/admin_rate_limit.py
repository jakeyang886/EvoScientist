"""Admin API rate limiter — simple in-memory per-minute counter."""

from __future__ import annotations

import time

_admin_counters: dict[str, tuple[float, int]] = {}
_ADMIN_RATE_LIMIT = 60  # requests per minute


def check_admin_rate_limit(admin_uid: str) -> bool:
    now = time.time()
    window_start, count = _admin_counters.get(admin_uid, (now, 0))
    if now - window_start >= 60:
        _admin_counters[admin_uid] = (now, 1)
        return True
    if count >= _ADMIN_RATE_LIMIT:
        return False
    _admin_counters[admin_uid] = (window_start, count + 1)
    return True
