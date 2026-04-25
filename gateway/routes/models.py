"""Model management routes."""

import logging
import os

from fastapi import APIRouter, Request

from gateway.models.model import ModelInfo, ModelListResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/models", tags=["models"])

# Cache the model list so we don't rebuild it on every request.
# Invalidated only when the process restarts (module reload).
_model_list_cache: tuple[list[ModelInfo], str] | None = None


def reset_model_list_cache() -> None:
    """Clear the in-process model list cache."""
    global _model_list_cache
    _model_list_cache = None


def _get_cached_model_list(preferred_default: str | None = None) -> tuple[list[ModelInfo], str]:
    """Return cached model list, building it only once per process."""
    global _model_list_cache
    if _model_list_cache is not None:
        return _model_list_cache
    _model_list_cache = _build_model_list(preferred_default)
    return _model_list_cache


# ─── Provider Availability Checks ────────────────────────────────

def _check_provider(provider: str) -> bool:
    """Check if a provider is likely usable based on environment variables or structured config."""
    checks = {
        "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
        "openai": bool(os.getenv("OPENAI_API_KEY")),
        "google-genai": bool(os.getenv("GOOGLE_API_KEY")),
        "nvidia": bool(os.getenv("NVIDIA_API_KEY")),
        "minimax": bool(os.getenv("MINIMAX_API_KEY")),
        "siliconflow": bool(os.getenv("SILICONFLOW_API_KEY")),
        "openrouter": bool(os.getenv("OPENROUTER_API_KEY")),
        "deepseek": bool(os.getenv("DEEPSEEK_API_KEY")),
        "zhipu": bool(os.getenv("ZHIPU_API_KEY")),
        "zhipu-code": bool(os.getenv("ZHIPU_API_KEY")),
        "volcengine": bool(os.getenv("VOLCENGINE_API_KEY")),
        "dashscope": bool(os.getenv("DASHSCOPE_API_KEY")),
        "dashscope-codingplan": bool(os.getenv("DASHSCOPE_API_KEY")),
        "moonshot": bool(os.getenv("MOONSHOT_API_KEY")),
        "kimi-coding": bool(os.getenv("KIMI_API_KEY")),
        "ollama": bool(os.getenv("OLLAMA_BASE_URL")),
        "custom-openai": (
            bool(os.getenv("CUSTOM_OPENAI_API_KEY"))
            and bool(os.getenv("CUSTOM_OPENAI_BASE_URL"))
        ),
        "custom-anthropic": (
            bool(os.getenv("CUSTOM_ANTHROPIC_API_KEY"))
            and bool(os.getenv("CUSTOM_ANTHROPIC_BASE_URL"))
        ),
    }
    return checks.get(provider, False)


# Capability hints for common models — used to enrich the API response.
_CAPABILITIES: dict[str, dict] = {
    "qwen3.6-plus": {"max_tokens": 128000, "supports_vision": True, "supports_reasoning": True},
}


def _get_capabilities(provider: str, model_id: str) -> dict:
    """Return capability hints for a model, with sensible defaults."""
    # Check by provider + model_id first
    caps = _CAPABILITIES.get(model_id)
    if caps:
        return caps
    # Heuristic fallbacks by provider
    if provider in ("anthropic", "minimax", "custom-anthropic"):
        return {"max_tokens": 64000, "supports_vision": True, "supports_reasoning": True}
    if provider in ("openai", "deepseek", "moonshot", "zhipu", "custom-openai"):
        return {"max_tokens": 128000, "supports_vision": True, "supports_reasoning": True}
    if provider in ("google-genai",):
        return {"max_tokens": 128000, "supports_vision": True, "supports_reasoning": True}
    if provider in ("openrouter",):
        return {"max_tokens": 128000, "supports_vision": True, "supports_reasoning": True}
    # Default
    return {"max_tokens": 32000, "supports_vision": False, "supports_reasoning": False}


def _build_model_list(preferred_default: str | None = None) -> tuple[list[ModelInfo], str]:
    """Build model list from structured config + central registry, filtered by available providers."""
    from EvoScientist.llm.models import _MODEL_ENTRIES, DEFAULT_MODEL

    # Fallback to config if preferred_default is not passed
    if not preferred_default:
        try:
            from EvoScientist.config import load_config
            preferred_default = load_config().model
        except Exception:
            pass

    seen = set()
    result = []

    # ── 1. Models from structured config (highest priority) ─────────
    try:
        from EvoScientist.config.model_config import list_available_models

        for m in list_available_models():
            model_id = m["id"]
            alias = m.get("alias", "")
            # Use alias as display name if available, otherwise use id
            display_name = alias or model_id
            # Avoid duplicates — alias and id both map to same model
            if display_name not in seen and model_id not in seen:
                seen.add(display_name)
                seen.add(model_id)
                result.append(ModelInfo(
                    id=model_id,
                    name=display_name,
                    provider=m["provider"],
                    max_tokens=m["max_tokens"],
                    supports_vision=m["supports_vision"],
                    supports_reasoning=m["supports_reasoning"],
                ))
    except Exception:
        pass

    # ── 2. Models from static registry (fallback) ──────────────────
    for short_name, model_id, provider in _MODEL_ENTRIES:
        if short_name in seen:
            continue

        # Filter: only include models from configured providers
        if not _check_provider(provider):
            continue

        seen.add(short_name)
        caps = _get_capabilities(provider, model_id)
        result.append(ModelInfo(
            id=short_name,
            name=short_name,
            provider=provider,
            max_tokens=caps["max_tokens"],
            supports_vision=caps["supports_vision"],
            supports_reasoning=caps["supports_reasoning"],
        ))

    # Determine the default model
    # Priority: 1. preferred_default (from CLI config), 2. Hardcoded DEFAULT_MODEL, 3. First available
    available_ids = [m.id for m in result]
    registry_default = ""

    if preferred_default and preferred_default in available_ids:
        registry_default = preferred_default
    elif DEFAULT_MODEL in available_ids:
        registry_default = DEFAULT_MODEL
    elif result:
        registry_default = result[0].id

    # Log the effective model configuration
    import sys
    if result:
        print(f"✅ Effective Models Configured ({len(result)}): {', '.join([m.id for m in result])}", file=sys.stderr)
        print(f"⚡ Selected Default: {registry_default}", file=sys.stderr)
    else:
        print("❌ No models are effectively configured. Check API keys or env vars.", file=sys.stderr)

    return result, registry_default


@router.get("", response_model=ModelListResponse)
async def list_models(request: Request):
    """Get available models list from the central registry."""
    models, registry_default = _build_model_list()
    # Allow env override, otherwise use registry default
    default_model = os.getenv("DEFAULT_MODEL", registry_default)
    return ModelListResponse(
        models=models,
        default_model=default_model,
    )
