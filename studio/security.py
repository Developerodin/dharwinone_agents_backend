"""Password hashing (stdlib PBKDF2) and HS256 JWT issue/verify."""

import base64
import hashlib
import hmac
import os
import secrets
import time

import jwt as pyjwt

_ITERATIONS = 600_000  # OWASP-recommended floor for PBKDF2-SHA256
_ISSUER = "dharwin-auth"
_AUDIENCE = "dharwin-api"
_LEEWAY_S = 30
TOKEN_TTL_S = 24 * 3600


class TokenError(Exception):
    pass


def _secret():
    value = os.environ.get("AUTH_JWT_SECRET", "").strip()
    if not value:
        raise RuntimeError("AUTH_JWT_SECRET is not set")
    return value


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS
    )
    return base64.b64encode(digest).decode("ascii"), salt


def verify_password(password, password_hash, salt):
    candidate, _ = hash_password(password, salt)
    return hmac.compare_digest(candidate, password_hash)


def issue_jwt(user_id, now=None):
    issued = int(now if now is not None else time.time())
    return pyjwt.encode(
        {
            "sub": user_id,
            "iat": issued,
            "exp": issued + TOKEN_TTL_S,
            "iss": _ISSUER,
            "aud": _AUDIENCE,
        },
        _secret(),
        algorithm="HS256",
    )


def verify_jwt(token):
    try:
        payload = pyjwt.decode(
            token,
            _secret(),
            algorithms=["HS256"],
            issuer=_ISSUER,
            audience=_AUDIENCE,
            leeway=_LEEWAY_S,
            options={"require": ["sub", "exp", "iss", "aud"]},
        )
    except pyjwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    return payload["sub"]
