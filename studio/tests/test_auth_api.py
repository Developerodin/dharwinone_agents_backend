"""Auth API: register, verify, login, resend, and first-user adoption."""

import re

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app
from studio.services import email_service


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(
        email_service, "send_email", lambda to, subject, html: sent.append(
            {"to": to, "subject": subject, "html": html}
        )
    )
    return sent


@pytest.fixture
def client():
    return TestClient(create_app())


REGISTER = {"name": "Jane", "email": "jane@example.com", "password": "hunter2abc"}


def _extract_token(html):
    return re.search(r"token=([A-Za-z0-9_\-%]+)", html).group(1)


def _register_and_verify(client, outbox, body=None):
    body = body or REGISTER
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text
    token = _extract_token(outbox[-1]["html"])
    assert client.post("/auth/verify", json={"token": token}).status_code == 200
    return body


def test_register_sends_verification_and_login_flow(client, outbox):
    _register_and_verify(client, outbox)
    r = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["user"]["email"] == "jane@example.com"
    assert body["user"]["name"] == "Jane"
    assert "passwordHash" not in str(body)


def test_register_rejects_duplicate_email(client, outbox):
    assert client.post("/auth/register", json=REGISTER).status_code == 201
    r = client.post("/auth/register", json=REGISTER)
    assert r.status_code == 409


def test_register_rejects_weak_password(client, outbox):
    weak = dict(REGISTER, password="short1")
    assert client.post("/auth/register", json=weak).status_code == 422
    no_number = dict(REGISTER, password="allletters")
    assert client.post("/auth/register", json=no_number).status_code == 422


def test_login_blocked_until_verified(client, outbox):
    client.post("/auth/register", json=REGISTER)
    r = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "unverified"


def test_login_generic_message_for_bad_password_and_unknown_email(client, outbox):
    _register_and_verify(client, outbox)
    bad_pw = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "wrongpass1"}
    )
    unknown = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "wrongpass1"}
    )
    assert bad_pw.status_code == 401
    assert unknown.status_code == 401
    assert bad_pw.json()["detail"] == unknown.json()["detail"]


def test_verify_rejects_bad_token(client, outbox):
    assert client.post("/auth/verify", json={"token": "nope"}).status_code == 400


def test_resend_verification_always_200(client, outbox):
    client.post("/auth/register", json=REGISTER)
    before = len(outbox)
    assert (
        client.post(
            "/auth/resend-verification", json={"email": "jane@example.com"}
        ).status_code
        == 200
    )
    assert len(outbox) == before + 1
    assert (
        client.post(
            "/auth/resend-verification", json={"email": "ghost@example.com"}
        ).status_code
        == 200
    )
    assert len(outbox) == before + 1  # no email for unknown address


def test_login_rate_limited_per_email(client, outbox):
    _register_and_verify(client, outbox)
    for _ in range(5):
        client.post(
            "/auth/login", json={"email": "jane@example.com", "password": "wrongpass1"}
        )
    r = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    )
    assert r.status_code == 429
    assert r.headers.get("retry-after")


def test_first_user_adopts_legacy_projects(client, outbox):
    from studio.repositories import projects_repo

    legacy = projects_repo.create("Legacy Site", owner_user_id="local-user")
    _register_and_verify(client, outbox)
    login = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    ).json()
    adopted = projects_repo.get(legacy["projectId"])
    assert adopted["ownerUserId"] == login["user"]["id"]
    lock = db.collection("meta").find_one({"_id": "legacy_adoption"})
    assert lock["userId"] == login["user"]["id"]


def test_second_user_adopts_nothing(client, outbox):
    from studio.repositories import projects_repo

    legacy = projects_repo.create("Legacy Site", owner_user_id="local-user")
    _register_and_verify(client, outbox)
    first = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    ).json()
    second_body = {"name": "Bob", "email": "bob@example.com", "password": "hunter2abc"}
    _register_and_verify(client, outbox, body=second_body)
    assert projects_repo.get(legacy["projectId"])["ownerUserId"] == first["user"]["id"]


def test_adoption_rewrite_is_idempotent(client, outbox):
    from studio.repositories import projects_repo
    from studio.services import auth_service

    projects_repo.create("Legacy Site", owner_user_id="local-user")
    _register_and_verify(client, outbox)
    login = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    ).json()
    # Re-running the rewrite must not change anything (conditional updates only).
    auth_service._rewrite_legacy_ownership(login["user"]["id"])
    docs = projects_repo.list_all()
    assert all(d["ownerUserId"] == login["user"]["id"] for d in docs)
