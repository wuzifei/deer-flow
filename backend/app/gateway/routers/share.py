"""Artifact 分享路由 — 生成无需鉴权的公开访问链接"""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response
from pydantic import BaseModel

from deerflow.config.paths import get_paths

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/share", tags=["share"])

_SHARE_FILE_NAME = "shared_artifacts.json"

# 复用 artifacts.py 的内容类型逻辑
_ACTIVE_CONTENT_MIME_TYPES = {
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
}


class ShareRequest(BaseModel):
    thread_id: str
    artifact_path: str
    expires_in_hours: int | None = None  # None = 永不过期


class ShareResponse(BaseModel):
    share_token: str
    share_url: str


def _share_file_path() -> Path:
    return get_paths().base_dir / _SHARE_FILE_NAME


def _load_shares() -> dict:
    p = _share_file_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_shares(data: dict) -> None:
    p = _share_file_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _build_content_disposition(disposition_type: str, filename: str) -> str:
    return f"{disposition_type}; filename*=UTF-8''{quote(filename)}"


@router.post("/", response_model=ShareResponse, summary="创建分享链接")
async def create_share(body: ShareRequest, request: Request) -> ShareResponse:
    """为指定 artifact 创建公开分享链接（需认证 + thread 所有者）"""
    from app.gateway.deps import get_thread_store
    from app.gateway.path_utils import resolve_thread_virtual_path

    # 手动所有者校验（thread_id 在 body 中，@require_permission 无法自动提取）
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    thread_store = get_thread_store(request)
    allowed = await thread_store.check_access(body.thread_id, str(user.id))
    if not allowed:
        raise HTTPException(status_code=404, detail=f"Thread {body.thread_id} not found")

    # 校验文件存在
    try:
        actual_path = resolve_thread_virtual_path(body.thread_id, body.artifact_path)
    except HTTPException:
        raise HTTPException(status_code=400, detail=f"无效路径: {body.artifact_path}")

    if not actual_path.exists() or not actual_path.is_file():
        raise HTTPException(status_code=404, detail=f"文件不存在: {body.artifact_path}")

    token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)

    share_data = {
        "thread_id": body.thread_id,
        "artifact_path": body.artifact_path,
        "user_id": str(user.id),
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=body.expires_in_hours)).isoformat()
        if body.expires_in_hours
        else None,
    }

    shares = _load_shares()
    shares[token] = share_data
    _save_shares(shares)

    logger.info("创建分享链接: token=%s, thread=%s, path=%s", token[:8], body.thread_id, body.artifact_path)

    return ShareResponse(share_token=token, share_url=f"/api/share/{token}")


@router.get("/{share_token}", summary="通过分享链接访问文件")
async def access_shared(share_token: str) -> Response:
    """无需鉴权，通过 token 访问分享的 artifact 文件"""
    import mimetypes

    shares = _load_shares()
    info = shares.get(share_token)

    if not info:
        raise HTTPException(status_code=404, detail="分享链接不存在")

    # 过期检查
    if info.get("expires_at"):
        expires = datetime.fromisoformat(info["expires_at"])
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=410, detail="分享链接已过期")

    # 解析文件路径
    try:
        paths = get_paths()
        user_id = info.get("user_id")
        actual_path = paths.resolve_virtual_path(
            info["thread_id"], info["artifact_path"], user_id=user_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not actual_path.exists() or not actual_path.is_file():
        raise HTTPException(status_code=404, detail="文件已被删除")

    mime_type, _ = mimetypes.guess_type(actual_path)

    # HTML/SVG 始终以附件下载
    if mime_type in _ACTIVE_CONTENT_MIME_TYPES:
        return FileResponse(
            path=actual_path,
            filename=actual_path.name,
            media_type=mime_type,
            headers={"Content-Disposition": _build_content_disposition("attachment", actual_path.name)},
        )

    # 文本文件内联显示
    if mime_type and mime_type.startswith("text/"):
        return PlainTextResponse(content=actual_path.read_text(encoding="utf-8"), media_type=mime_type)

    # 检测二进制中的文本文件
    try:
        with open(actual_path, "rb") as f:
            sample = f.read(8192)
        if b"\x00" not in sample:
            return PlainTextResponse(content=actual_path.read_text(encoding="utf-8"), media_type=mime_type)
    except Exception:
        pass

    # 二进制文件内联返回
    return Response(
        content=actual_path.read_bytes(),
        media_type=mime_type or "application/octet-stream",
        headers={"Content-Disposition": _build_content_disposition("inline", actual_path.name)},
    )
