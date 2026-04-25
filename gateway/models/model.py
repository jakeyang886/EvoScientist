"""Model list Pydantic models."""

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    max_tokens: int
    supports_vision: bool
    supports_reasoning: bool


class ModelListResponse(BaseModel):
    models: list[ModelInfo]
    default_model: str
