"""User accounts and one-time auth tokens."""

import time

import pytest
from studio import config, db
from studio.repositories import users_repo


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def _make_user(email="jane@example.com"):
    return users_repo.create("Jane", email, "hash-b64", "salt-hex")


def test_create_and_find_by_email_normalizes_case():
    _make_user("Jane@Example.COM")
    doc = users_repo.find_by_email("  jane@example.com ")
    assert doc is not None
    assert doc["email"] == "jane@example.com"
    assert doc["emailVerified"] is False
    assert doc["passwordHash"] == "hash-b64"
    assert doc["userId"].startswith("usr-")


def test_create_returns_public_doc_without_password_fields():
    created = _make_user()
    assert "passwordHash" not in created
    assert "passwordSalt" not in created
    assert created["name"] == "Jane"


def test_is_empty_flips_after_first_user():
    assert users_repo.is_empty() is True
    _make_user()
    assert users_repo.is_empty() is False


def test_set_verified_and_find_by_id():
    created = _make_user()
    users_repo.set_verified(created["userId"])
    assert users_repo.find_by_id(created["userId"])["emailVerified"] is True


def test_set_password_replaces_hash():
    created = _make_user()
    users_repo.set_password(created["userId"], "new-hash", "new-salt")
    doc = users_repo.find_by_email("jane@example.com")
    assert doc["passwordHash"] == "new-hash"
    assert doc["passwordSalt"] == "new-salt"


def test_token_roundtrip_is_single_use():
    created = _make_user()
    raw = users_repo.issue_token(created["userId"], "verify", ttl_s=60)
    assert users_repo.consume_token(raw, "verify") == created["userId"]
    assert users_repo.consume_token(raw, "verify") is None


def test_token_wrong_purpose_and_expiry_rejected(monkeypatch):
    created = _make_user()
    raw = users_repo.issue_token(created["userId"], "reset", ttl_s=60)
    assert users_repo.consume_token(raw, "verify") is None
    expired = users_repo.issue_token(created["userId"], "reset", ttl_s=-1)
    assert users_repo.consume_token(expired, "reset") is None


def test_public_strips_password_fields():
    _make_user()
    doc = users_repo.find_by_email("jane@example.com")
    pub = users_repo.public(doc)
    assert "passwordHash" not in pub and "passwordSalt" not in pub
    assert pub["email"] == "jane@example.com"


def test_create_raises_email_taken_on_duplicate_key(monkeypatch):
    from pymongo.errors import DuplicateKeyError

    _make_user()
    coll = db.collection("users")

    def boom(doc):
        raise DuplicateKeyError("E11000 duplicate key")

    monkeypatch.setattr(coll, "insert_one", boom)
    with pytest.raises(users_repo.EmailTaken):
        _make_user("jane@example.com")
