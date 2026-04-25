"""File upload Pydantic models."""

from pydantic import BaseModel


class FileInfo(BaseModel):
    filename: str
    size: int
    mime_type: str
    virtual_path: str
    is_dir: bool = False


class UploadResponse(BaseModel):
    files: list[FileInfo]
