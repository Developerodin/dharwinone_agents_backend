import json
import os
import threading
import time

from harness import supervisor


def test_learn_concurrent_no_lost_updates(tmp_path):
    stats = str(tmp_path / "stats.json")
    barrier = threading.Barrier(2)

    def worker(shipped):
        barrier.wait()
        for _ in range(50):
            supervisor.learn(stats, "feature", "big", shipped)

    t1 = threading.Thread(target=worker, args=(True,))
    t2 = threading.Thread(target=worker, args=(False,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    with open(stats, encoding="utf-8") as f:
        data = json.load(f)
    s = data["feature"]["big"]
    assert s["ship"] == 50 and s["block"] == 50


def test_learn_steals_stale_lock(tmp_path):
    stats = str(tmp_path / "stats.json")
    lock = stats + ".lock"
    with open(lock, "wb") as f:
        f.write(b"x")
    old = os.path.getmtime(lock)
    os.utime(lock, (old - 60, old - 60))
    supervisor.learn(stats, "fix", "small", True)
    with open(stats, encoding="utf-8") as f:
        assert json.load(f)["fix"]["small"]["ship"] == 1
    assert not os.path.exists(lock)
