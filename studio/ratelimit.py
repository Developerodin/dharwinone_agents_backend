"""Sliding-window rate limiter for auth endpoints."""

# ponytail: in-memory, single-process only; move counters to Mongo if the
# studio backend ever runs multiple instances.

import time

_buckets = {}


def _prune(key, window_s):
    now = time.time()
    bucket = _buckets.setdefault(key, [])
    bucket[:] = [ts for ts in bucket if now - ts < window_s]
    return bucket


def allow(key, limit, window_s):
    bucket = _prune(key, window_s)
    if len(bucket) >= limit:
        return False
    bucket.append(time.time())
    return True


def retry_after(key, window_s):
    bucket = _prune(key, window_s)
    if not bucket:
        return 0
    return max(1, int(window_s - (time.time() - bucket[0])))


def reset_for_tests():
    _buckets.clear()
