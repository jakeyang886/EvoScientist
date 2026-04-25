"""Global file upload routes — upload files to user's workspace without needing a thread_id."""

import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from gateway.models.file import FileInfo, UploadResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "text/plain", "text/csv", "text/markdown", "text/x-python",
    "text/javascript", "text/typescript", "text/x-yaml", "text/x-json",
    "application/json", "application/pdf",
    "image/png", "image/jpeg", "image/gif", "image/webp",
}

# Magic bytes for validation
MAGIC_BYTES = {
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF8": "image/gif",
    b"RIFF": "image/webp",  # simplified
    b"%PDF": "application/pdf",
}

MAX_FILE_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(25 * 1024 * 1024)))
MAX_FILES_PER_UPLOAD = 10


def _safe_filename(name: str) -> str:
    """Sanitize filename to prevent path traversal."""
    name = Path(name).name
    name = "".join(c for c in name if c.isalnum() or c in "._- ")
    if len(name.encode()) > 255:
        name = name[:255]
    return name or "unnamed"


def _validate_magic_bytes(content: bytes) -> str | None:
    """Detect MIME type from magic bytes."""
    for magic, mime_type in MAGIC_BYTES.items():
        if content[:len(magic)] == magic:
            return mime_type
    return None


def _get_user_uploads_dir(user_uid: str) -> Path:
    """Get the global uploads directory for a user."""
    uploads_dir = Path.home() / ".evoscientist" / "uploads" / user_uid
    uploads_dir.mkdir(parents=True, exist_ok=True)
    return uploads_dir


@router.post("", response_model=UploadResponse)
async def upload_files(request: Request, files: list[UploadFile] = File(...)):
    """Upload files to user's global uploads directory."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=400,
            detail={"code": "file_too_many", "message": f"Maximum {MAX_FILES_PER_UPLOAD} files per upload"},
        )

    uploads_dir = _get_user_uploads_dir(user_uid)

    uploaded = []
    for f in files:
        if not f.filename:
            continue

        # Read content
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail={"code": "file_too_large", "message": f"File exceeds {MAX_FILE_SIZE // (1024*1024)}MB limit"},
            )

        # Validate MIME type
        mime = f.content_type or "application/octet-stream"
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail={"code": "file_type_unsupported", "message": f"File type {mime} not allowed"},
            )

        # Validate magic bytes for binary types
        if mime.startswith(("image/", "application/pdf")):
            detected = _validate_magic_bytes(content)
            if detected and detected != mime:
                logger.warning("MIME type mismatch: declared=%s, detected=%s", mime, detected)

        # Save file
        safe_name = _safe_filename(f.filename)
        unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        dest = uploads_dir / unique_name
        dest.write_bytes(content)

        uploaded.append(FileInfo(
            filename=safe_name,
            size=len(content),
            mime_type=mime,
            virtual_path=unique_name,
        ))

    return UploadResponse(files=uploaded)


@router.get("")
async def list_uploaded_files(request: Request):
    """List all uploaded files in user's global uploads directory."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    uploads_dir = _get_user_uploads_dir(user_uid)

    if not uploads_dir.exists():
        return {"files": []}

    files = []
    for f in sorted(uploads_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if f.is_file():
            # Extract original name (remove UUID prefix)
            original_name = f.name.split("_", 1)[-1] if "_" in f.name else f.name
            files.append({
                "filename": original_name,
                "virtual_path": f.name,
                "size": f.stat().st_size,
                "mime_type": _guess_mime(f.name),
                "created_at": f.stat().st_mtime,
            })

    return {"files": files}


@router.delete("/{file_path}")
async def delete_uploaded_file(file_path: str, request: Request):
    """Delete an uploaded file from user's global uploads directory."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    uploads_dir = _get_user_uploads_dir(user_uid)

    # Security: prevent path traversal
    safe_path = Path(file_path).name
    target = uploads_dir / safe_path

    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")

    target.unlink()
    return {"success": True}


def _guess_mime(filename: str) -> str:
    """Guess MIME type from filename extension."""
    ext = Path(filename).suffix.lower()
    mime_map = {
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".md": "text/markdown",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/typescript",
        ".yaml": "text/x-yaml",
        ".yml": "text/x-yaml",
        ".json": "application/json",
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return mime_map.get(ext, "application/octet-stream")
