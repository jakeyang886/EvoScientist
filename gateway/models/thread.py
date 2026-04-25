"""Thread/Session Pydantic models."""

from typing import Optional

from pydantic import BaseModel, Field


class ThreadCreate(BaseModel):
    message: str | None = None
    model: str | None = None
    model_params: dict | None = None


class StreamRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    files: list[dict] = []
    model: str | None = None
    model_params: dict | None = None


class ThreadResponse(BaseModel):
    thread_id: str
    title: str
    created_at: str
    updated_at: str
    source: str
    status: str
    metadata: dict | None = None


class ThreadListResponse(BaseModel):
    threads: list[ThreadResponse]
    total: int


class ThreadRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str
    tool_calls: list[dict] = []
    attachments: list[dict] = []
