from __future__ import annotations

import hashlib
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

ALLOWED_TYPES = {
    "application/pdf": (b"%PDF-", ".pdf"),
    "image/png": (b"\x89PNG\r\n\x1a\n", ".png"),
    "image/jpeg": (b"\xff\xd8\xff", ".jpg"),
}


def storage_root() -> Path:
    root = Path(get_settings().document_storage_dir).expanduser()
    if not root.is_absolute():
        root = Path.cwd() / root
    return root.resolve()


def read_valid_upload(upload: UploadFile) -> tuple[bytes, str, str, str]:
    maximum = get_settings().document_max_file_bytes
    content = upload.file.read(maximum + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment is empty")
    if len(content) > maximum:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Attachment exceeds the configured size limit",
        )

    media_type = next(
        (
            mime
            for mime, (signature, _extension) in ALLOWED_TYPES.items()
            if content.startswith(signature)
        ),
        None,
    )
    if media_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF, PNG, and JPEG attachments are allowed",
        )

    raw_name = (upload.filename or "attachment").replace("\\", "/").split("/")[-1]
    safe_name = re.sub(r"[^\w.() -]", "_", raw_name, flags=re.UNICODE).strip(" .")[:255]
    if not safe_name:
        safe_name = "attachment"
    key = f"{uuid.uuid4().hex}{ALLOWED_TYPES[media_type][1]}"
    return content, media_type, safe_name, key


def resolve_storage_key(storage_key: str) -> Path:
    root = storage_root()
    candidate = (root / storage_key).resolve()
    if candidate.parent != root or Path(storage_key).name != storage_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return candidate


def write_attachment(storage_key: str, content: bytes) -> Path:
    path = resolve_storage_key(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(content)
    return path


def remove_attachment(storage_key: str) -> None:
    path = resolve_storage_key(storage_key)
    path.unlink(missing_ok=True)


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
