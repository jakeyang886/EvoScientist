"""Pricing configuration loader — load/save/refresh pricing.json.

This module provides a singleton PricingConfig backed by gateway/pricing.json.
If the file is missing or corrupt, hardcoded defaults are used (zero-impact on
existing deployments).

Usage:
    from gateway.pricing_config import get_pricing_config, save_pricing_config

    cfg = get_pricing_config()          # read current config (in-memory)
    await save_pricing_config(data, admin_uid)  # validate + write + refresh
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from gateway.models.pricing import PricingConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default pricing (matches pricing.json shipped with the project)
# ---------------------------------------------------------------------------

_DEFAULT_DICT: Dict[str, Any] = {
    "version": 1,
    "updated_at": None,
    "updated_by": None,
    "token_pricing": {
        "price_per_million_tokens": 2.0,
        "currency": "CNY",
    },
    "plans": {
        "starter": {
            "label": "入门版",
            "billing_mode": "pay_as_you_go",
            "initial_tokens": 100000,
            "price_per_million": 2.0,
            "rate_limits": {
                "tokens_per_minute": 100000,
                "tokens_per_day": 2000000,
                "requests_per_5h": None,
                "requests_per_week": None,
            },
            "max_concurrent_threads": 1,
        },
        "pro": {
            "label": "专业版",
            "billing_mode": "subscription",
            "monthly_fee": 99.0,
            "default_days": 30,
            "rate_limits": {
                "tokens_per_minute": 200000,
                "tokens_per_day": 5000000,
                "requests_per_5h": 100,
                "requests_per_week": 1000,
            },
            "max_concurrent_threads": 3,
        },
        "max": {
            "label": "旗舰版",
            "billing_mode": "subscription",
            "monthly_fee": 199.0,
            "default_days": 30,
            "rate_limits": {
                "tokens_per_minute": 500000,
                "tokens_per_day": 10000000,
                "requests_per_5h": 300,
                "requests_per_week": 3000,
            },
            "max_concurrent_threads": 5,
        },
        "ultra": {
            "label": "至尊版",
            "billing_mode": "subscription",
            "monthly_fee": 399.0,
            "default_days": 30,
            "rate_limits": {
                "tokens_per_minute": None,
                "tokens_per_day": None,
                "requests_per_5h": None,
                "requests_per_week": None,
            },
            "max_concurrent_threads": 10,
        },
    },
}

_DEFAULT_PRICING = PricingConfig.model_validate(_DEFAULT_DICT)

# ---------------------------------------------------------------------------
# File path helpers
# ---------------------------------------------------------------------------

def _pricing_json_path() -> Path:
    """Return the path to pricing.json (next to gateway/config.py)."""
    return Path(__file__).resolve().parent / "pricing.json"


# ---------------------------------------------------------------------------
# Module-level singleton + lock
# ---------------------------------------------------------------------------

_pricing_config: Optional[PricingConfig] = None
_save_lock = asyncio.Lock()


def get_pricing_config() -> PricingConfig:
    """Return the cached PricingConfig singleton.

    Lazily loads from JSON on first call; falls back to defaults on any error.
    """
    global _pricing_config
    if _pricing_config is not None:
        return _pricing_config

    path = _pricing_json_path()
    try:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            _pricing_config = PricingConfig.model_validate(data)
            logger.info("pricing_config_loaded from %s (version=%d)", path, _pricing_config.version)
            return _pricing_config
    except Exception:
        logger.warning("pricing_config_load_failed, using defaults", exc_info=True)

    _pricing_config = _DEFAULT_PRICING.model_copy(deep=True)
    logger.info("pricing_config_using_defaults")
    return _pricing_config


def refresh_pricing_config() -> PricingConfig:
    """Force-reload pricing.json from disk and update the singleton.

    Used after an admin saves new settings.
    """
    global _pricing_config
    path = _pricing_json_path()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        _pricing_config = PricingConfig.model_validate(data)
        logger.info("pricing_config_refreshed (version=%d)", _pricing_config.version)
    except Exception:
        logger.warning("pricing_config_refresh_failed, keeping previous config", exc_info=True)
    return _pricing_config  # type: ignore[return-value]


async def save_pricing_config(data: Dict[str, Any], admin_uid: str) -> PricingConfig:
    """Validate, write, and atomically replace pricing.json.

    Steps:
      1. Acquire asyncio.Lock (serialise concurrent saves)
      2. Validate with Pydantic PricingConfig
      3. Bump version, set updated_at / updated_by
      4. Atomic write (tmp + rename)
      5. Refresh in-memory singleton
    """
    async with _save_lock:
        # 1. Validate
        current = get_pricing_config()
        new_version = current.version + 1
        data["version"] = new_version
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        data["updated_by"] = admin_uid

        config = PricingConfig.model_validate(data)

        # 2. Atomic write
        path = _pricing_json_path()
        json_bytes = config.model_dump_json(indent=2).encode("utf-8")

        # Write to temp file in same directory (same filesystem for rename)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(path.parent), prefix=".pricing_", suffix=".json.tmp"
        )
        try:
            os.write(tmp_fd, json_bytes)
            os.close(tmp_fd)
            os.rename(tmp_path, str(path))
        except BaseException:
            # Clean up temp file on any error
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

        # 3. Refresh singleton
        global _pricing_config
        _pricing_config = config
        logger.info(
            "pricing_config_saved version=%d admin=%s", new_version, admin_uid
        )
        return config


def reset_pricing_config() -> None:
    """Reset the singleton (for testing)."""
    global _pricing_config
    _pricing_config = None


# ---------------------------------------------------------------------------
# Helper: get plan-specific config
# ---------------------------------------------------------------------------

def get_plan_config(plan: str) -> Dict[str, Any]:
    """Return the rate_limits and max_concurrent_threads for a given plan.

    Falls back to starter if plan is unknown.
    """
    cfg = get_pricing_config()
    plan_cfg = cfg.plans.get(plan)  # type: ignore[arg-type]
    if plan_cfg is None:
        plan_cfg = cfg.plans["starter"]
    return {
        "label": plan_cfg.label,
        "billing_mode": plan_cfg.billing_mode,
        "rate_limits": plan_cfg.rate_limits.model_dump(),
        "max_concurrent_threads": plan_cfg.max_concurrent_threads,
        "initial_tokens": plan_cfg.initial_tokens,
        "price_per_million": plan_cfg.price_per_million,
        "monthly_fee": plan_cfg.monthly_fee,
        "default_days": plan_cfg.default_days,
    }


def calculate_cost(billed_tokens: int, plan: str) -> float:
    """Convert billed tokens to cost (CNY) for a given plan.

    Uses the plan-specific price_per_million if available (starter),
    otherwise falls back to global token_pricing.
    """
    cfg = get_pricing_config()
    plan_cfg = cfg.plans.get(plan)  # type: ignore[arg-type]
    if plan_cfg and plan_cfg.price_per_million is not None:
        ppm = plan_cfg.price_per_million
    else:
        ppm = cfg.token_pricing.price_per_million_tokens
    return billed_tokens / 1_000_000 * ppm
