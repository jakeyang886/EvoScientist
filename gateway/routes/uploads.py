"""File upload routes."""

import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from gateway.models.file import FileInfo, UploadResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threads/{thread_id}/uploads", tags=["uploads"])

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "text/plain", "text/csv", "text/markdown", "text/x-python",
    "text/javascript", "text/typescript", "text/x-yaml", "text/x-json",
    "application/json", "application/pdf",
    "image/png", "image/jpeg", "image/gif", "image/webp",
    # Office documents
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",        # .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",              # .xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",      # .pptx
    "application/msword",                                                             # .doc
    "application/vnd.ms-excel",                                                       # .xls
    "application/vnd.ms-powerpoint",                                                  # .ppt
    # Compressed / archive
    "application/zip", "application/x-zip-compressed",
    "application/vnd.rar", "application/x-rar-compressed",
    # Rich text
    "application/rtf",
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
    # Remove path components
    name = Path(name).name
    # Remove dangerous characters
    name = "".join(c for c in name if c.isalnum() or c in "._- ")
    # Truncate
    if len(name.encode()) > 255:
        name = name[:255]
    return name or "unnamed"


def _validate_magic_bytes(content: bytes) -> str | None:
    """Detect MIME type from magic bytes."""
    for magic, mime_type in MAGIC_BYTES.items():
        if content[:len(magic)] == magic:
            return mime_type
    return None


@router.get("")
async def list_thread_uploads(thread_id: str, request: Request):
    """List all files/dirs in a thread's workspace recursively."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    workspace_dir = Path.home() / ".evoscientist" / "runs" / user_uid / f"web_{thread_id}"

    files = []

    def _scan(directory: Path, prefix: str = "") -> None:
        """Recursively scan directory, collecting files and subdirectories."""
        if not directory.exists():
            return
        # Sort: directories first, then files; within each group sort by name
        entries = sorted(directory.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
        for entry in entries:
            rel = f"{prefix}{entry.name}" if prefix else entry.name
            if entry.is_dir():
                # Skip hidden / __pycache__ / node_modules
                if entry.name.startswith(".") or entry.name == "__pycache__" or entry.name == "node_modules":
                    continue
                files.append({
                    "filename": entry.name,
                    "virtual_path": rel,
                    "size": 0,
                    "mime_type": "",
                    "is_dir": True,
                    "created_at": entry.stat().st_mtime,
                })
                _scan(entry, prefix=f"{rel}/")
            elif entry.is_file():
                # For uploads dir, strip UUID prefix for display name
                display_name = entry.name
                if prefix.startswith("uploads/"):
                    display_name = entry.name.split("_", 1)[-1] if "_" in entry.name else entry.name
                else:
                    display_name = entry.name
                files.append({
                    "filename": display_name,
                    "virtual_path": rel,
                    "size": entry.stat().st_size,
                    "mime_type": _guess_mime(entry.name),
                    "is_dir": False,
                    "created_at": entry.stat().st_mtime,
                })

    _scan(workspace_dir)
    return {"files": files}


@router.post("", response_model=UploadResponse)
async def upload_files(thread_id: str, request: Request, files: list[UploadFile] = File(...)):
    """Upload files to a thread's workspace."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=400,
            detail={"code": "file_too_many", "message": f"Maximum {MAX_FILES_PER_UPLOAD} files per upload"},
        )

    # Determine workspace path
    workspace_dir = Path.home() / ".evoscientist" / "runs" / user_uid / f"web_{thread_id}"
    uploads_dir = workspace_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

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
        # Browsers may send empty or generic 'application/octet-stream' for many file types.
        # Fall back to filename-extension-based guessing in that case.
        mime = f.content_type
        if not mime or mime == "application/octet-stream":
            mime = _guess_mime(f.filename or "")
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
        # Add UUID prefix to avoid collisions
        unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        dest = uploads_dir / unique_name
        dest.write_bytes(content)

        virtual_path = f"uploads/{unique_name}"
        uploaded.append(FileInfo(
            filename=safe_name,
            size=len(content),
            mime_type=mime,
            virtual_path=virtual_path,
        ))

    return UploadResponse(files=uploaded)


@router.delete("/{file_path}")
async def delete_thread_upload(thread_id: str, file_path: str, request: Request):
    """Delete a file from a thread's workspace uploads directory."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    workspace_dir = Path.home() / ".evoscientist" / "runs" / user_uid / f"web_{thread_id}"
    uploads_dir = workspace_dir / "uploads"

    # Security: prevent path traversal — only use filename
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
        # Office documents
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".doc": "application/msword",
        ".xls": "application/vnd.ms-excel",
        ".ppt": "application/vnd.ms-powerpoint",
        # Archives
        ".zip": "application/zip",
        ".rar": "application/vnd.rar",
        # Rich text
        ".rtf": "application/rtf",
    }
    return mime_map.get(ext, "application/octet-stream")
