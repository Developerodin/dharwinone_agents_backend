"""Request auth context. The JWT middleware in app.py verifies the token
and stores the subject on request.state; routes read it from here."""

from fastapi import HTTPException, Request


def resolve_user_id(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    return user_id
