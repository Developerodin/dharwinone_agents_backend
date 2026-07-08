from harness import guard


def base_cfg():
    return {
        "limits": {"min_disk_gb": 1},
        "accept_templates": {
            "pytest": ["python", "-m", "pytest", "{args}"],
            "node_test": ["npm", "test", "--", "{args}"],
        },
    }


def chat_task(**over):
    t = {
        "id": "c1", "category": "feature", "title": "t", "prompt": "p",
        "allow_paths": ["src/"], "source": "chat",
        "accept_template": "pytest", "accept_args": ["tests/test_foo.py"],
    }
    t.update(over)
    return t


def test_chat_string_accept_violation():
    task = chat_task(accept='python -c "evil"')
    v = guard.guard(task, base_cfg(), free_gb=10)
    assert any("chat" in x.lower() or "accept" in x.lower() for x in v)


def test_chat_valid_template_becomes_argv_list():
    task = chat_task()
    v = guard.guard(task, base_cfg(), free_gb=10)
    assert v == []
    assert task["accept"] == ["python", "-m", "pytest", "tests/test_foo.py"]


def test_chat_bad_args_rejected():
    for bad in ["foo;bar", "a b", "../x", "a&b"]:
        task = chat_task(accept_args=[bad])
        v = guard.guard(task, base_cfg(), free_gb=10)
        assert v


def test_chat_unknown_template():
    task = chat_task(accept_template="nope")
    v = guard.guard(task, base_cfg(), free_gb=10)
    assert any("template" in x.lower() for x in v)


def test_non_chat_string_accept_untouched():
    task = {
        "id": "t1", "category": "feature", "title": "t", "prompt": "p",
        "accept": "python -m pytest", "allow_paths": ["src/"],
    }
    v = guard.guard(task, base_cfg(), free_gb=10)
    assert v == []
    assert task["accept"] == "python -m pytest"
