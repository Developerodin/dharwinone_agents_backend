"""User accounts and one-time auth tokens (verify / reset)."""

import hashlib
import secrets
import time

from sqlalchemy.exc import IntegrityError

from studio import db
from studio.models import AuthToken, User, to_doc

VERIFY_TTL_S = 24 * 3600
RESET_TTL_S = 3600


class AuthDbUnavailable(Exception):
    pass


class EmailTaken(Exception):
    pass


def _normalize_email(email):
    return (email or "").strip().lower()


def _token_hash(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def public(user):
    if not user:
        return user
    clean = dict(user)
    clean.pop("passwordHash", None)
    clean.pop("passwordSalt", None)
    return clean


def create(name, email, password_hash, salt):
    doc = User(
        userId=f"usr-{secrets.token_hex(8)}",
        email=_normalize_email(email),
        name=name.strip(),
        passwordHash=password_hash,
        passwordSalt=salt,
        emailVerified=False,
        createdAt=time.time(),
    )
    with db.session() as s:
        s.add(doc)
        try:
            s.commit()
        except IntegrityError as exc:
            s.rollback()
            raise EmailTaken(_normalize_email(email)) from exc
        return public(to_doc(doc))


def find_by_email(email):
    with db.session() as s:
        row = s.query(User).filter_by(email=_normalize_email(email)).first()
        return to_doc(row)


def find_by_id(user_id):
    with db.session() as s:
        row = s.query(User).filter_by(userId=user_id).first()
        return to_doc(row)


def is_empty():
    with db.session() as s:
        return s.query(User).first() is None


def set_verified(user_id):
    with db.session() as s:
        s.query(User).filter_by(userId=user_id).update({"emailVerified": True})
        s.commit()


def set_password(user_id, password_hash, salt):
    with db.session() as s:
        s.query(User).filter_by(userId=user_id).update(
            {"passwordHash": password_hash, "passwordSalt": salt}
        )
        s.commit()


def issue_token(user_id, purpose, ttl_s):
    raw = secrets.token_urlsafe(32)
    with db.session() as s:
        s.add(
            AuthToken(
                tokenHash=_token_hash(raw),
                userId=user_id,
                purpose=purpose,
                expiresAt=time.time() + ttl_s,
            )
        )
        s.commit()
    return raw


def consume_token(raw, purpose):
    hashed = _token_hash(raw or "")
    with db.session() as s:
        row = s.query(AuthToken).filter_by(tokenHash=hashed, purpose=purpose).first()
        if not row:
            return None
        expires_at, user_id = row.expiresAt, row.userId
        s.query(AuthToken).filter_by(tokenHash=hashed).delete()
        s.commit()
    return user_id if expires_at >= time.time() else None
