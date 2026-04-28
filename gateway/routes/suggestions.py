"""User suggestion routes."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse

from gateway.middleware.admin_guard import require_admin

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])
admin_router = APIRouter(prefix="/api/admin/suggestions", tags=["admin-suggestions"], dependencies=[Depends(require_admin)])

MAX_SUGGESTION_FILES = 5
MAX_SUGGESTION_FILE_SIZE = int(os.getenv("MAX_SUGGESTION_FILE_SIZE", str(10 * 1024 * 1024)))

ALLOWED_MIME_TYPES = {
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/rtf",
    "application/zip",
    "application/x-zip-compressed",
}


def _storage_dir() -> Path:
    from EvoScientist.config.settings import get_config_dir

    path = get_config_dir() / "suggestions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(name: str) -> str:
    name = Path(name).name
    name = "".join(c for c in name if c.isalnum() or c in "._- ")
    return name[:255] or "unnamed"


def _guess_mime(filename: str) -> str:
    import mimetypes

    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


async def _attachments_for(db, suggestion_ids: list[int]) -> dict[int, list[dict]]:
    if not suggestion_ids:
        return {}
    placeholders = ",".join("?" for _ in suggestion_ids)
    rows = await db.execute_fetchall(
        f"""
        SELECT id, suggestion_id, filename, mime_type, size, created_at
        FROM suggestion_attachments
        WHERE suggestion_id IN ({placeholders})
        ORDER BY id ASC
        """,
        suggestion_ids,
    )
    grouped: dict[int, list[dict]] = {sid: [] for sid in suggestion_ids}
    for r in rows:
        grouped.setdefault(r["suggestion_id"], []).append({
            "id": r["id"],
            "filename": r["filename"],
            "mime_type": r["mime_type"],
            "size": r["size"],
            "created_at": r["created_at"],
            "download_url": f"/api/admin/suggestions/attachments/{r['id']}",
        })
    return grouped


@router.post("")
async def create_suggestion(
    request: Request,
    title: str = Form(...),
    content: str = Form(...),
    files: list[UploadFile] | None = File(default=None),
):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    clean_title = title.strip()
    clean_content = content.strip()
    if not clean_title or not clean_content:
        raise HTTPException(status_code=400, detail={"code": "invalid_suggestion", "message": "标题和内容不能为空"})
    if len(clean_title) > 120:
        raise HTTPException(status_code=400, detail={"code": "title_too_long", "message": "标题不能超过 120 个字符"})
    if len(clean_content) > 5000:
        raise HTTPException(status_code=400, detail={"code": "content_too_long", "message": "内容不能超过 5000 个字符"})

    upload_files = [f for f in (files or []) if f.filename]
    if len(upload_files) > MAX_SUGGESTION_FILES:
        raise HTTPException(status_code=400, detail={"code": "too_many_files", "message": f"最多上传 {MAX_SUGGESTION_FILES} 个附件"})

    from gateway.database import get_connection

    db = await get_connection()
    cursor = await db.execute(
        "INSERT INTO suggestions (user_id, title, content) VALUES (?, ?, ?)",
        (user_id, clean_title, clean_content),
    )
    suggestion_id = cursor.lastrowid

    try:
        for upload in upload_files:
            content_bytes = await upload.read()
            if len(content_bytes) > MAX_SUGGESTION_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "file_too_large", "message": f"单个附件不能超过 {MAX_SUGGESTION_FILE_SIZE // (1024 * 1024)}MB"},
                )
            mime_type = upload.content_type or _guess_mime(upload.filename or "")
            if mime_type == "application/octet-stream":
                mime_type = _guess_mime(upload.filename or "")
            if mime_type not in ALLOWED_MIME_TYPES:
                raise HTTPException(status_code=400, detail={"code": "file_type_unsupported", "message": f"不支持的附件类型: {mime_type}"})

            safe_name = _safe_filename(upload.filename or "unnamed")
            stored_name = f"{suggestion_id}_{uuid.uuid4().hex}_{safe_name}"
            (_storage_dir() / stored_name).write_bytes(content_bytes)
            await db.execute(
                """
                INSERT INTO suggestion_attachments (suggestion_id, filename, stored_name, mime_type, size)
                VALUES (?, ?, ?, ?, ?)
                """,
                (suggestion_id, safe_name, stored_name, mime_type, len(content_bytes)),
            )
        await db.commit()
    except Exception:
        await db.rollback()
        for p in _storage_dir().glob(f"{suggestion_id}_*"):
            p.unlink(missing_ok=True)
        raise

    return {"id": suggestion_id, "ok": True}


@admin_router.get("")
async def list_suggestions(
    q: str = Query(default=""),
    status: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    from gateway.database import get_connection

    db = await get_connection()
    where_clauses = []
    params: list = []
    if q:
        where_clauses.append("(s.title LIKE ? OR s.content LIKE ? OR u.username LIKE ? OR u.email LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
    if status:
        where_clauses.append("s.status = ?")
        params.append(status)
    where = " AND ".join(where_clauses) if where_clauses else "1=1"

    count_row = await db.execute_fetchone(
        f"""
        SELECT COUNT(*) AS cnt
        FROM suggestions s
        JOIN users u ON u.id = s.user_id
        WHERE {where}
        """,
        params,
    )
    total = count_row["cnt"] if count_row else 0
    offset = (page - 1) * size
    rows = await db.execute_fetchall(
        f"""
        SELECT s.id, s.title, s.content, s.status, s.created_at, s.updated_at,
               u.uid AS user_uid, u.username, u.email
        FROM suggestions s
        JOIN users u ON u.id = s.user_id
        WHERE {where}
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [size, offset],
    )
    ids = [r["id"] for r in rows]
    attachments = await _attachments_for(db, ids)
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "title": r["title"],
            "content": r["content"],
            "status": r["status"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "user": {
                "uid": r["user_uid"],
                "username": r["username"],
                "email": r["email"],
            },
            "attachments": attachments.get(r["id"], []),
        })
    return {"items": items, "total": total, "page": page, "size": size, "pages": (total + size - 1) // size}


@admin_router.patch("/{suggestion_id}")
async def update_suggestion_status(suggestion_id: int, body: dict):
    status = str(body.get("status", "")).strip()
    if status not in {"open", "reviewing", "resolved", "closed"}:
        raise HTTPException(status_code=400, detail={"code": "invalid_status", "message": "无效状态"})

    from gateway.database import get_connection

    db = await get_connection()
    cursor = await db.execute(
        """
        UPDATE suggestions
        SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
        """,
        (status, suggestion_id),
    )
    await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return {"ok": True, "status": status}


@admin_router.get("/attachments/{attachment_id}")
async def download_suggestion_attachment(attachment_id: int):
    from gateway.database import get_connection

    db = await get_connection()
    row = await db.execute_fetchone(
        "SELECT filename, stored_name, mime_type FROM suggestion_attachments WHERE id = ?",
        (attachment_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = _storage_dir() / row["stored_name"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found")
    return FileResponse(path, media_type=row["mime_type"] or "application/octet-stream", filename=row["filename"])
