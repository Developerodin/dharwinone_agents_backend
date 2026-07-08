"""Request auth context for builder APIs."""

import os

from fastapi import Header, HTTPException


def resolve_user_id(x_studio_user_id: str | None = Header(default=None)):
    return (x_studio_user_id or os.environ.get("STUDIO_DEFAULT_USER_ID", "local-user")).strip()


def require_authenticated(user_id: str = Header(default=None, alias="X-Studio-User-Id")):
    uid = resolve_user_id(user_id)
    if not uid:
        raise HTTPException(status_code=401, detail="authentication required")
    return uid
