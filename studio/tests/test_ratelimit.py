"""Sliding-window in-memory rate limiter."""

import pytest

from studio import ratelimit


@pytest.fixture(autouse=True)
def clean():
    ratelimit.reset_for_tests()
    yield
    ratelimit.reset_for_tests()


def test_allows_up_to_limit_then_blocks():
    for _ in range(3):
        assert ratelimit.allow("k", limit=3, window_s=60) is True
    assert ratelimit.allow("k", limit=3, window_s=60) is False


def test_keys_are_independent():
    assert ratelimit.allow("a", limit=1, window_s=60) is True
    assert ratelimit.allow("b", limit=1, window_s=60) is True
    assert ratelimit.allow("a", limit=1, window_s=60) is False


def test_window_expiry_frees_slots(monkeypatch):
    import time as _time

    t = {"now": 1000.0}
    monkeypatch.setattr(ratelimit.time, "time", lambda: t["now"])
    assert ratelimit.allow("k", limit=1, window_s=60) is True
    assert ratelimit.allow("k", limit=1, window_s=60) is False
    t["now"] = 1061.0
    assert ratelimit.allow("k", limit=1, window_s=60) is True


def test_retry_after_is_positive_when_blocked(monkeypatch):
    t = {"now": 1000.0}
    monkeypatch.setattr(ratelimit.time, "time", lambda: t["now"])
    ratelimit.allow("k", limit=1, window_s=60)
    assert ratelimit.allow("k", limit=1, window_s=60) is False
    assert 0 < ratelimit.retry_after("k", window_s=60) <= 60
