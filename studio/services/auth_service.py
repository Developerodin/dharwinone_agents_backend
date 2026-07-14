"""Registration, verification, login, and first-user legacy adoption."""

import re
import time

from pymongo.errors import DuplicateKeyError

from studio import db, security
from studio.repositories import users_repo
from studio.services import email_service

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_GENERIC_LOGIN_ERROR = "invalid email or password"


class AuthError(Exception):
    def __init__(self, status, detail):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


def _validate_registration(name, email, password):
    if not (name or "").strip():
        raise AuthError(422, "name is required")
    if not _EMAIL_RE.match((email or "").strip()):
        raise AuthError(422, "invalid email address")
    if (
        len(password or "") < 8
        or not re.search(r"[A-Za-z]", password)
        or not re.search(r"\d", password)
    ):
        raise AuthError(
            422, "password must be at least 8 characters with a letter and a number"
        )


def register(name, email, password, base_url=None):
    _validate_registration(name, email, password)
    if users_repo.find_by_email(email):
        raise AuthError(409, "an account with this email already exists")
    adopt = users_repo.is_empty()
    password_hash, salt = security.hash_password(password)
    try:
        user = users_repo.create(name, email, password_hash, salt)
    except users_repo.EmailTaken as exc:
        # Unique-index race: a concurrent registration won between the
        # pre-check above and this insert.
        raise AuthError(409, "an account with this email already exists") from exc
    if adopt:
        _adopt_legacy_data(user["userId"])
    raw = users_repo.issue_token(user["userId"], "verify", users_repo.VERIFY_TTL_S)
    email_service.send_verification(user["email"], raw, base_url=base_url)
    return user


def verify_email(raw_token):
    user_id = users_repo.consume_token(raw_token, "verify")
    if not user_id:
        raise AuthError(400, "invalid or expired verification token")
    users_repo.set_verified(user_id)


def login(email, password):
    user = users_repo.find_by_email(email)
    if not user or not security.verify_password(
        password, user["passwordHash"], user["passwordSalt"]
    ):
        raise AuthError(401, _GENERIC_LOGIN_ERROR)
    if not user.get("emailVerified"):
        raise AuthError(
            403,
            {
                "code": "unverified",
                "message": "verify your email before signing in",
            },
        )
    return {
        "token": security.issue_jwt(user["userId"]),
        "user": {
            "id": user["userId"],
            "email": user["email"],
            "name": user["name"],
        },
    }


def resend_verification(email, base_url=None):
    user = users_repo.find_by_email(email)
    if not user or user.get("emailVerified"):
        return
    raw = users_repo.issue_token(user["userId"], "verify", users_repo.VERIFY_TTL_S)
    email_service.send_verification(user["email"], raw, base_url=base_url)


def forgot_password(email, base_url=None):
    user = users_repo.find_by_email(email)
    if not user:
        return
    raw = users_repo.issue_token(user["userId"], "reset", users_repo.RESET_TTL_S)
    email_service.send_password_reset(user["email"], raw, base_url=base_url)


def reset_password(raw_token, new_password):
    if (
        len(new_password or "") < 8
        or not re.search(r"[A-Za-z]", new_password)
        or not re.search(r"\d", new_password)
    ):
        raise AuthError(
            422, "password must be at least 8 characters with a letter and a number"
        )
    user_id = users_repo.consume_token(raw_token, "reset")
    if not user_id:
        raise AuthError(400, "invalid or expired reset token")
    password_hash, salt = security.hash_password(new_password)
    users_repo.set_password(user_id, password_hash, salt)


def _adopt_legacy_data(user_id):
    """First registered account claims everything owned by 'local-user'."""
    coll = db.collection("meta")
    if coll is None:
        return
    if coll.find_one({"_id": "legacy_adoption"}):
        return
    try:
        coll.insert_one({"_id": "legacy_adoption", "userId": user_id, "at": time.time()})
    except DuplicateKeyError:
        return  # another registration won the race; adoption already claimed
    except Exception as exc:
        # Unexpected DB failure: registration must still succeed; adoption
        # can be retried manually (the lock was not written).
        print(f"[auth] legacy adoption lock failed unexpectedly: {exc}")
        return
    try:
        _rewrite_legacy_ownership(user_id)
    except Exception as exc:  # registration must not fail on adoption
        print(f"[auth] legacy adoption rewrite failed (re-runnable): {exc}")


def _rewrite_legacy_ownership(user_id):
    """Idempotent: only touches docs still owned by 'local-user'.

    Enumeration verified via repo-wide grep (see plan Task 5 Step 4):
    builder_projects.ownerUserId is the only ownership field in any store.
    The legacy studio/data/projects.json file store predates ownership and
    carries no owner field - nothing to rewrite there.
    """
    coll = db.collection("builder_projects")
    if coll is not None:
        coll.update_many(
            {"ownerUserId": "local-user"}, {"$set": {"ownerUserId": user_id}}
        )
