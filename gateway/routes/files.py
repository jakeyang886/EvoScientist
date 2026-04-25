"""File download route — serve files from thread workspace."""

import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threads/{thread_id}/files", tags=["files"])


def _get_user_uploads_dir(user_uid: str) -> Path:
    """Get the global uploads directory for a user."""
    return Path.home() / ".evoscientist" / "uploads" / user_uid


def _get_thread_workspace(user_uid: str, thread_id: str) -> Path:
    """Get the thread workspace directory."""
    return Path.home() / ".evoscientist" / "runs" / user_uid / f"web_{thread_id}"


def _search_file(start_path: Path, target_name: str) -> Path | None:
    """Search for a file in start_path (including subdirs) by name."""
    for p in start_path.rglob(target_name):
        if p.is_file():
            return p
    return None


@router.get("/{file_path:path}")
async def download_file(thread_id: str, file_path: str, request: Request):
    """Download a file from the thread workspace or global uploads."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Clean up path components
    clean_path = file_path.strip("/")
    target_name = Path(clean_path).name
    
    # Clean up UUID prefix for display/download
    display_name = target_name
    if "_" in target_name and len(target_name.split("_")[0]) == 8 and all(c in "0123456789abcdef" for c in target_name.split("_")[0]):
        display_name = "_".join(target_name.split("_")[1:])

    workspace = _get_thread_workspace(user_uid, thread_id)
    target = None

    # Search Order:
    # 1. Exact path in workspace
    exact = workspace / clean_path
    if exact.is_file():
        target = exact
    else:
        # 2. Exact path in uploads
        exact_uploads = workspace / "uploads" / clean_path
        if exact_uploads.is_file():
            target = exact_uploads
        else:
            # 3. Search by name in workspace (for relative paths like "review.md")
            target = _search_file(workspace, target_name)
            
            if not target:
                # 4. Search by name in global uploads
                uploads_dir = _get_user_uploads_dir(user_uid)
                if uploads_dir.exists():
                    target = _search_file(uploads_dir, target_name)

    if not target:
        raise HTTPException(status_code=404, detail=f"File not found: {target_name}")

    # Guess MIME type
    content_type, _ = mimetypes.guess_type(str(target))
    if not content_type:
        content_type = "application/octet-stream"

    return FileResponse(
        str(target),
        media_type=content_type,
        filename=display_name,
        headers={"Cache-Control": "private, max-age=3600"},
    )
