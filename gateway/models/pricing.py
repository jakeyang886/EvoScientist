"""Pricing configuration Pydantic models for admin settings."""

from __future__ import annotations

from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class RateLimitsConfig(BaseModel):
    """Rate limit settings for a plan."""

    tokens_per_minute: Optional[int] = Field(None, ge=1, description="Token限流：每分钟")
    tokens_per_day: Optional[int] = Field(None, ge=1, description="Token限流：每天")
    requests_per_5h: Optional[int] = Field(None, ge=1, description="请求次数：每5小时")
    requests_per_week: Optional[int] = Field(None, ge=1, description="请求次数：每7天")

    model_config = {"extra": "forbid"}


class PlanConfig(BaseModel):
    """Configuration for a single billing plan."""

    label: str = Field(..., min_length=1, max_length=20)
    billing_mode: Literal["pay_as_you_go", "subscription"]
    # Starter fields
    initial_tokens: Optional[int] = Field(None, ge=0)
    price_per_million: Optional[float] = Field(None, ge=0)
    # Subscription fields
    monthly_fee: Optional[float] = Field(None, ge=0)
    default_days: Optional[int] = Field(None, ge=1)
    # Shared
    rate_limits: RateLimitsConfig
    max_concurrent_threads: int = Field(1, ge=1)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_plan_fields(self) -> "PlanConfig":
        if self.billing_mode == "pay_as_you_go":
            if self.initial_tokens is None:
                raise ValueError("pay_as_you_go plan must have initial_tokens")
            if self.price_per_million is None:
                raise ValueError("pay_as_you_go plan must have price_per_million")
        elif self.billing_mode == "subscription":
            if self.monthly_fee is None:
                raise ValueError("subscription plan must have monthly_fee")
            if self.default_days is None:
                raise ValueError("subscription plan must have default_days")
        return self


class TokenPricingConfig(BaseModel):
    """Global token pricing."""

    price_per_million_tokens: float = Field(..., gt=0)
    currency: str = Field("CNY", pattern=r"^[A-Z]{3}$")

    model_config = {"extra": "forbid"}


PlanName = Literal["starter", "pro", "max", "ultra"]

VALID_PLAN_NAMES = ("starter", "pro", "max", "ultra")


class PricingConfig(BaseModel):
    """Full pricing configuration — stored as pricing.json."""

    version: int = Field(1, ge=1)
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    token_pricing: TokenPricingConfig
    plans: Dict[PlanName, PlanConfig]

    model_config = {"extra": "forbid"}

    @field_validator("plans")
    @classmethod
    def validate_all_plans_present(cls, v: dict) -> dict:
        for name in VALID_PLAN_NAMES:
            if name not in v:
                raise ValueError(f"Missing required plan: {name}")
        return v
