"""Shared test setup: JWT secret + rate-limiter isolation for all suites."""

import os

import pytest

os.environ.setdefault("AUTH_JWT_SECRET", "test-secret")


@pytest.fixture(autouse=True)
def _clean_ratelimit():
    from studio import ratelimit

    ratelimit.reset_for_tests()
    yield
    ratelimit.reset_for_tests()
