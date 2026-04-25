"""File manager — validation and cleanup utilities."""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    # Text / Code
    ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".csv", ".md", ".txt",
    ".html", ".css", ".sh", ".bash", ".zsh", ".sql", ".xml",
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    # Documents
    ".pdf",
}

ALLOWED_MIME_TYPES = {
    "text/plain", "text/csv", "text/markdown", "text/x-python",
    "text/javascript", "text/typescript", "text/x-yaml", "text/x-json",
    "application/json", "application/pdf",
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
}


def validate_file(filename: str, mime_type: str) -> list[str]:
    """Validate a file's name and MIME type. Returns list of errors (empty = ok)."""
    errors: list[str] = []
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        errors.append(f"File extension '{ext}' not allowed")
    if mime_type not in ALLOWED_MIME_TYPES:
        errors.append(f"MIME type '{mime_type}' not allowed")
    return errors


def safe_filename(name: str) -> str:
    """Sanitize filename to prevent path traversal."""
    name = Path(name).name
    name = "".join(c for c in name if c.isalnum() or c in "._- ")
    name = name.strip()
    if not name:
        name = "unnamed"
    if len(name.encode("utf-8")) > 255:
        name = name[:255]
    return name


async def cleanup_orphan_uploads(base_dir: str, max_age_hours: int = 1) -> int:
    """Remove orphaned upload files older than max_age_hours.

    Returns number of files deleted.
    """
    import time

    base = Path(base_dir).expanduser()
    if not base.exists():
        return 0

    cutoff = time.time() - (max_age_hours * 3600)
    deleted = 0

    for upload_dir in base.rglob("uploads"):
        if not upload_dir.is_dir():
            continue
        for f in upload_dir.iterdir():
            if f.is_file() and f.stat().st_mtime < cutoff:
                try:
                    f.unlink()
                    deleted += 1
                    logger.info("Cleaned orphan upload: %s", f)
                except Exception as e:
                    logger.warning("Failed to delete orphan upload %s: %s", f, e)

    return deleted
