"""User accounts and one-time auth tokens (verify / reset)."""

import hashlib
import secrets
import time

from pymongo.errors import DuplicateKeyError

from studio import db

_USERS = "users"
_TOKENS = "auth_tokens"

VERIFY_TTL_S = 24 * 3600
RESET_TTL_S = 3600

_email_index_ensured = False


class AuthDbUnavailable(Exception):
    pass


class EmailTaken(Exception):
    pass


def _coll(name):
    coll = db.collection(name)
    if coll is None:
        raise AuthDbUnavailable("auth database unavailable")
    return coll


def _users():
    """Users collection with a unique email index on real Mongo.

    The memory:// fake has no create_index (and no concurrency), so the
    service-level find_by_email pre-check covers tests; real Mongo gets the
    index so a concurrent duplicate registration loses with DuplicateKeyError.
    """
    global _email_index_ensured
    coll = _coll(_USERS)
    if not _email_index_ensured:
        if hasattr(coll, "create_index"):
            coll.create_index("email", unique=True)
        _email_index_ensured = True
    return coll


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
    doc = {
        "userId": f"usr-{secrets.token_hex(8)}",
        "email": _normalize_email(email),
        "name": name.strip(),
        "passwordHash": password_hash,
        "passwordSalt": salt,
        "emailVerified": False,
        "createdAt": time.time(),
    }
    try:
        _users().insert_one(doc)
    except DuplicateKeyError as exc:
        raise EmailTaken(doc["email"]) from exc
    return public(db.strip_id(doc))


def find_by_email(email):
    return db.strip_id(_users().find_one({"email": _normalize_email(email)}))


def find_by_id(user_id):
    return db.strip_id(_users().find_one({"userId": user_id}))


def is_empty():
    return _users().find_one({}) is None


def set_verified(user_id):
    _users().update_one({"userId": user_id}, {"$set": {"emailVerified": True}})


def set_password(user_id, password_hash, salt):
    _users().update_one(
        {"userId": user_id},
        {"$set": {"passwordHash": password_hash, "passwordSalt": salt}},
    )


def issue_token(user_id, purpose, ttl_s):
    raw = secrets.token_urlsafe(32)
    _coll(_TOKENS).insert_one(
        {
            "tokenHash": _token_hash(raw),
            "userId": user_id,
            "purpose": purpose,
            "expiresAt": time.time() + ttl_s,
        }
    )
    return raw


def consume_token(raw, purpose):
    hashed = _token_hash(raw or "")
    doc = _coll(_TOKENS).find_one({"tokenHash": hashed, "purpose": purpose})
    if not doc:
        return None
    _coll(_TOKENS).delete_many({"tokenHash": hashed})
    if doc["expiresAt"] < time.time():
        return None
    return doc["userId"]
