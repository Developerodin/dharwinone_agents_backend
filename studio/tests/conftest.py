"""Shared test setup: JWT secret + rate-limiter isolation for all suites."""

import os

import pytest

os.environ.setdefault("AUTH_JWT_SECRET", "test-secret")

# `import studio` loads backend/.env, real AWS creds included. Pin the mock on so the
# suite can never write to the live bucket; a test that wants real S3 must opt in.
os.environ["STUDIO_S3_MOCK"] = "true"


@pytest.fixture(autouse=True)
def _clean_ratelimit():
    from studio import ratelimit

    ratelimit.reset_for_tests()
    yield
    ratelimit.reset_for_tests()
