"""Endpoint statistics routes — real-time in-memory stats + historical DB queries."""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request

from gateway.middleware.admin_guard import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/endpoints", tags=["admin", "endpoints"],
                   dependencies=[Depends(require_admin)])


# ─── Helpers ──────────────────────────────────────────────────

def _format_number(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def _build_bar(pct: float) -> str:
    filled = int(pct / 5)
    return "█" * filled + "░" * (20 - filled)


# ─── Real-time in-memory stats ────────────────────────────────

@router.get("/stats")
async def get_endpoint_stats(request: Request):
    """Return per-endpoint call counts, token usage, and model distribution.

    Requires admin authentication.  Data is from the in-memory
    ``EndpointStats`` singleton — reset on process restart.
    """
    try:
        from EvoScientist.config.model_config import get_endpoint_stats
    except ImportError:
        return {"endpoints": [], "summary": {"total_calls": 0, "total_input_tokens": 0, "total_output_tokens": 0}}

    stats = get_endpoint_stats()
    snap = stats.snapshot()

    total_calls = 0
    total_input = 0
    total_output = 0
    endpoints = []

    for (provider, endpoint), data in sorted(snap.items()):
        calls = data["calls"]
        inp = data["input_tokens"]
        out = data["output_tokens"]
        total_calls += calls
        total_input += inp
        total_output += out

        endpoints.append({
            "provider": provider,
            "endpoint": endpoint,
            "calls": calls,
            "pct": 0,
            "bar": "",
            "input_tokens": inp,
            "output_tokens": out,
            "models": dict(sorted(data["models"].items())),
            "last_call_ts": data["last_call_ts"],
        })

    for ep in endpoints:
        ep["pct"] = round(ep["calls"] / total_calls * 100, 1) if total_calls else 0
        ep["bar"] = _build_bar(ep["pct"])

    return {
        "endpoints": endpoints,
        "summary": {
            "total_calls": total_calls,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
        },
    }


@router.post("/stats/reset")
async def reset_endpoint_stats(request: Request):
    """Clear all in-memory endpoint statistics counters."""
    from EvoScientist.config.model_config import get_endpoint_stats
    get_endpoint_stats().reset()
    return {"ok": True}


# ─── Historical DB queries ────────────────────────────────────

@router.get("/history")
async def get_endpoint_history(
    request: Request,
    start_date: str = Query(None, description="Start date YYYY-MM-DD (default: 7 days ago)"),
    end_date: str = Query(None, description="End date YYYY-MM-DD (default: today)"),
    group_by: str = Query("day", description="Grouping: 'day', 'endpoint', 'model'"),
):
    """Query historical endpoint usage from endpoint_usage_daily aggregation table.

    Supports grouping by day (time series), endpoint (distribution),
    or model (per-model breakdown).  Date range defaults to last 7 days.
    """
    from gateway.database import get_connection

    # Default date range: last 7 days
    today = date.today()
    start = start_date or (today - timedelta(days=7)).isoformat()
    end = end_date or today.isoformat()

    db = await get_connection()

    # Check if endpoint_usage_daily table exists (graceful degradation)
    try:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='endpoint_usage_daily'"
        )
        if not await cursor.fetchone():
            return {
                "group_by": group_by,
                "start_date": start,
                "end_date": end,
                "endpoints": [],
                "summary": {"total_calls": 0, "total_input_tokens": 0, "total_output_tokens": 0},
                "message": "endpoint_usage_daily table not yet created — pending database migration",
            }
    except Exception:
        return {
            "group_by": group_by,
            "start_date": start,
            "end_date": end,
            "endpoints": [],
            "summary": {"total_calls": 0, "total_input_tokens": 0, "total_output_tokens": 0},
        }

    if group_by == "day":
        # Time series per endpoint per day — read from pre-aggregated table
        rows = await db.execute_fetchall(
            """
            SELECT
                date,
                provider,
                endpoint,
                model,
                calls,
                input_tokens,
                output_tokens
            FROM endpoint_usage_daily
            WHERE date BETWEEN ? AND ?
            ORDER BY date ASC, provider, endpoint
            """,
            (start, end),
        )
        # Build time series per endpoint
        series: dict[str, dict] = {}
        for r in rows:
            ep_key = f"{r['provider']}/{r['endpoint']}"
            if ep_key not in series:
                series[ep_key] = {
                    "provider": r["provider"],
                    "endpoint": r["endpoint"],
                    "days": [],
                    "total_input": 0,
                    "total_output": 0,
                    "total_calls": 0,
                    "models_set": set(),
                }
            series[ep_key]["days"].append({
                "date": r["date"],
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "calls": r["calls"],
            })
            series[ep_key]["total_input"] += r["input_tokens"]
            series[ep_key]["total_output"] += r["output_tokens"]
            series[ep_key]["total_calls"] += r["calls"]
            if r["model"]:
                series[ep_key]["models_set"].add(r["model"])

        # Clean up: remove internal sets before serialization
        for ep in series.values():
            ep.pop("models_set", None)

        all_dates = sorted(set(
            day["date"]
            for s in series.values()
            for day in s["days"]
        ))

        return {
            "group_by": "day",
            "start_date": start,
            "end_date": end,
            "dates": all_dates,
            "endpoints": list(series.values()),
        }

    elif group_by == "endpoint":
        # Aggregate per endpoint over the date range
        rows = await db.execute_fetchall(
            """
            SELECT
                provider,
                endpoint,
                SUM(calls) AS calls,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                GROUP_CONCAT(DISTINCT model) AS models_csv
            FROM endpoint_usage_daily
            WHERE date BETWEEN ? AND ?
            GROUP BY provider, endpoint
            ORDER BY calls DESC
            """,
            (start, end),
        )
        total_calls = sum(r["calls"] for r in rows)
        endpoints = []
        for r in rows:
            calls = r["calls"]
            pct = round(calls / total_calls * 100, 1) if total_calls else 0
            models = [m for m in (r["models_csv"].split(",") if r["models_csv"] else []) if m]
            endpoints.append({
                "provider": r["provider"],
                "endpoint": r["endpoint"],
                "calls": calls,
                "pct": pct,
                "bar": _build_bar(pct),
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "models": models,
            })

        return {
            "group_by": "endpoint",
            "start_date": start,
            "end_date": end,
            "endpoints": endpoints,
            "summary": {
                "total_calls": total_calls,
                "total_input_tokens": sum(r["input_tokens"] for r in rows),
                "total_output_tokens": sum(r["output_tokens"] for r in rows),
            },
        }

    elif group_by == "model":
        # Aggregate per model (+ endpoint) over the date range
        rows = await db.execute_fetchall(
            """
            SELECT
                model,
                provider,
                endpoint,
                SUM(calls) AS calls,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens
            FROM endpoint_usage_daily
            WHERE date BETWEEN ? AND ?
            GROUP BY model, provider, endpoint
            ORDER BY calls DESC
            """,
            (start, end),
        )
        total_calls = sum(r["calls"] for r in rows)
        models = []
        for r in rows:
            calls = r["calls"]
            pct = round(calls / total_calls * 100, 1) if total_calls else 0
            models.append({
                "model": r["model"],
                "endpoint": r["endpoint"],
                "provider": r["provider"],
                "calls": calls,
                "pct": pct,
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
            })

        return {
            "group_by": "model",
            "start_date": start,
            "end_date": end,
            "models": models,
            "summary": {
                "total_calls": total_calls,
                "total_input_tokens": sum(r["input_tokens"] for r in rows),
                "total_output_tokens": sum(r["output_tokens"] for r in rows),
            },
        }

    else:
        return {"error": f"Invalid group_by: {group_by}. Use 'day', 'endpoint', or 'model'."}
