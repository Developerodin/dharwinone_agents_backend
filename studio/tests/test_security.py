"""Password hashing + JWT primitives."""

import time

import pytest


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret")


def test_hash_and_verify_password_roundtrip():
    from studio import security

    hashed, salt = security.hash_password("hunter2abc1")
    assert security.verify_password("hunter2abc1", hashed, salt) is True
    assert security.verify_password("wrong-pass1", hashed, salt) is False


def test_hash_password_uses_unique_salts():
    from studio import security

    h1, s1 = security.hash_password("samepassword1")
    h2, s2 = security.hash_password("samepassword1")
    assert s1 != s2
    assert h1 != h2


def test_issue_and_verify_jwt_roundtrip():
    from studio import security

    token = security.issue_jwt("usr-abc123")
    assert security.verify_jwt(token) == "usr-abc123"


def test_verify_jwt_rejects_expired():
    from studio import security

    token = security.issue_jwt("usr-abc123", now=time.time() - security.TOKEN_TTL_S - 60)
    with pytest.raises(security.TokenError):
        security.verify_jwt(token)


def test_verify_jwt_rejects_wrong_issuer_and_audience():
    import jwt as pyjwt

    from studio import security

    now = int(time.time())
    bad_iss = pyjwt.encode(
        {"sub": "u", "iat": now, "exp": now + 600, "iss": "evil", "aud": "dharwin-api"},
        "test-secret",
        algorithm="HS256",
    )
    bad_aud = pyjwt.encode(
        {"sub": "u", "iat": now, "exp": now + 600, "iss": "dharwin-auth", "aud": "evil"},
        "test-secret",
        algorithm="HS256",
    )
    with pytest.raises(security.TokenError):
        security.verify_jwt(bad_iss)
    with pytest.raises(security.TokenError):
        security.verify_jwt(bad_aud)


def test_verify_jwt_rejects_wrong_secret_and_garbage():
    import jwt as pyjwt

    from studio import security

    now = int(time.time())
    forged = pyjwt.encode(
        {"sub": "u", "iat": now, "exp": now + 600, "iss": "dharwin-auth", "aud": "dharwin-api"},
        "other-secret",
        algorithm="HS256",
    )
    with pytest.raises(security.TokenError):
        security.verify_jwt(forged)
    with pytest.raises(security.TokenError):
        security.verify_jwt("not-a-jwt")
