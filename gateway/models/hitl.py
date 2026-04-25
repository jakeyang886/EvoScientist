"""HITL Pydantic models."""

from pydantic import BaseModel, Field


class InterruptApproval(BaseModel):
    approved: bool


class InterruptAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=5000)
