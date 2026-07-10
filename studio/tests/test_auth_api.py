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


def test_forgot_password_always_200_and_reset_flow(client, outbox):
    _register_and_verify(client, outbox)
    assert (
        client.post(
            "/auth/forgot-password", json={"email": "ghost@example.com"}
        ).status_code
        == 200
    )
    before = len(outbox)
    assert (
        client.post(
            "/auth/forgot-password", json={"email": "jane@example.com"}
        ).status_code
        == 200
    )
    assert len(outbox) == before + 1
    reset_token = _extract_token(outbox[-1]["html"])
    r = client.post(
        "/auth/reset-password",
        json={"token": reset_token, "password": "newpassword1"},
    )
    assert r.status_code == 200
    old = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    )
    new = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "newpassword1"}
    )
    assert old.status_code == 401
    assert new.status_code == 200


def test_reset_password_rejects_bad_token_and_weak_password(client, outbox):
    _register_and_verify(client, outbox)
    assert (
        client.post(
            "/auth/reset-password", json={"token": "nope", "password": "newpassword1"}
        ).status_code
        == 400
    )
    client.post("/auth/forgot-password", json={"email": "jane@example.com"})
    reset_token = _extract_token(outbox[-1]["html"])
    assert (
        client.post(
            "/auth/reset-password", json={"token": reset_token, "password": "weak"}
        ).status_code
        == 422
    )


def test_forgot_password_rate_limited(client, outbox):
    _register_and_verify(client, outbox)
    for _ in range(3):
        client.post("/auth/forgot-password", json={"email": "jane@example.com"})
    r = client.post("/auth/forgot-password", json={"email": "jane@example.com"})
    assert r.status_code == 429


def _bearer(client, outbox):
    _register_and_verify(client, outbox)
    login = client.post(
        "/auth/login", json={"email": "jane@example.com", "password": "hunter2abc"}
    ).json()
    return {"Authorization": f"Bearer {login['token']}"}, login["user"]["id"]


def test_protected_route_requires_jwt(client, outbox):
    assert client.get("/builder/projects").status_code == 401
    assert (
        client.get(
            "/builder/projects", headers={"Authorization": "Bearer garbage"}
        ).status_code
        == 401
    )


def test_protected_route_accepts_valid_jwt(client, outbox):
    headers, _uid = _bearer(client, outbox)
    assert client.get("/builder/projects", headers=headers).status_code == 200


def test_projects_are_scoped_to_owner(client, outbox):
    headers, uid = _bearer(client, outbox)
    created = client.post(
        "/builder/projects",
        json={"projectName": "Mine", "initialPrompt": None},
        headers=headers,
    )
    assert created.status_code == 201
    assert created.json()["ownerUserId"] == uid
    listing = client.get("/builder/projects", headers=headers).json()
    assert [p["projectId"] for p in listing] == [created.json()["projectId"]]

    # A second user sees an empty list.
    second = {"name": "Bob", "email": "bob@example.com", "password": "hunter2abc"}
    _register_and_verify(client, outbox, body=second)
    bob = client.post(
        "/auth/login", json={"email": "bob@example.com", "password": "hunter2abc"}
    ).json()
    bob_headers = {"Authorization": f"Bearer {bob['token']}"}
    assert client.get("/builder/projects", headers=bob_headers).json() == []
