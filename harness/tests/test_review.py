from harness import review


class FakeOllama:
    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts = []

    def generate(self, model, prompt, **kw):
        self.prompts.append(prompt)
        return self.replies.pop(0)


TASK = {"id": "T1", "title": "add endpoint", "category": "feature"}


def test_review_accept(tmp_path):
    sk = tmp_path / "sk.yaml"
    sk.write_text("all:\n  - Rule A\nfeature:\n  - Rule F\n")
    fake = FakeOllama(['{"verdict": "ACCEPT", "findings": []}'])
    v = review.review(fake, "m", TASK, "+ code", str(sk), max_diff_kb=64)
    assert v["verdict"] == "ACCEPT"
    assert "Rule A" in fake.prompts[0] and "Rule F" in fake.prompts[0]


def test_review_oversized_diff_escalates(tmp_path):
    sk = tmp_path / "sk.yaml"
    sk.write_text("all: []\n")
    v = review.review(FakeOllama([]), "m", TASK, "x" * 70000, str(sk),
                      max_diff_kb=64)
    assert v["verdict"] == "ESCALATE"


def test_review_unparseable_reasks_then_escalates(tmp_path):
    sk = tmp_path / "sk.yaml"
    sk.write_text("all: []\n")
    fake = FakeOllama(["garbage", "more garbage"])
    v = review.review(fake, "m", TASK, "+ code", str(sk), max_diff_kb=64)
    assert v["verdict"] == "ESCALATE"
    assert len(fake.prompts) == 2
