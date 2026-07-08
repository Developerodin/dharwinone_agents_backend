"""Plan explain + simulate analysis stages."""
import ast
import json
import os
import re

from harness import guard

_JS_IMPORT = re.compile(
    r"""import\s+(?:[\w*{}\s,]+\s+from\s+)?['"](\.[^'"]+)['"]""")
_JS_REQUIRE = re.compile(r"""require\s*\(\s*['"](\.[^'"]+)['"]\s*\)""")


def _norm_path(path):
    return path.replace("\\", "/")


def _resolve_relative(base_file, rel):
    base = os.path.dirname(base_file)
    raw = os.path.normpath(os.path.join(base, rel))
    candidates = []
    for ext in ("", ".py", ".ts", ".tsx", ".js", ".jsx"):
        p = raw + ext if ext else raw
        candidates.append(_norm_path(p))
    return candidates


def _index_python(repo_root):
    idx = {}
    for root, _, files in os.walk(repo_root):
        if ".git" in root.split(os.sep):
            continue
        for name in files:
            if not name.endswith(".py"):
                continue
            rel = _norm_path(os.path.relpath(os.path.join(root, name), repo_root))
            stem = rel[:-3]
            idx[stem] = rel
            idx[os.path.basename(stem)] = rel
    return idx


def _python_imports(path, text, py_idx):
    refs = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return refs
    base_stem = path[:-3] if path.endswith(".py") else path
    pkg = os.path.dirname(base_stem)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = alias.name.replace(".", "/")
                refs.extend(_resolve_python(mod, pkg, py_idx))
        elif isinstance(node, ast.ImportFrom):
            level = node.level or 0
            mod = (node.module or "").replace(".", "/")
            if level:
                parent = pkg
                for _ in range(level - 1):
                    parent = os.path.dirname(parent)
                if mod:
                    mod_path = os.path.normpath(os.path.join(parent, mod)).replace("\\", "/")
                else:
                    mod_path = parent.replace("\\", "/")
                refs.extend(_resolve_python(mod_path, pkg, py_idx))
            elif mod:
                refs.extend(_resolve_python(mod, pkg, py_idx))
    return refs


def _resolve_python(mod_path, pkg, py_idx):
    out = []
    candidates = [
        mod_path,
        os.path.normpath(os.path.join(pkg, mod_path)).replace("\\", "/"),
    ]
    for c in candidates:
        if c in py_idx:
            out.append(py_idx[c])
        elif f"{c}.py" in py_idx:
            out.append(py_idx[f"{c}.py"])
        else:
            key = c if c.endswith(".py") else f"{c}.py"
            if key in py_idx:
                out.append(py_idx[key])
    return out


def _js_imports(path, text):
    refs = []
    for pat in (_JS_IMPORT, _JS_REQUIRE):
        for m in pat.finditer(text):
            refs.extend(_resolve_relative(path, m.group(1)))
    return refs


def _build_graph(repo_root):
    py_idx = _index_python(repo_root)
    graph = {}
    for root, _, files in os.walk(repo_root):
        if ".git" in root.split(os.sep):
            continue
        for name in files:
            if not name.endswith((".py", ".js", ".ts", ".tsx", ".jsx")):
                continue
            rel = _norm_path(os.path.relpath(os.path.join(root, name), repo_root))
            try:
                with open(os.path.join(root, name), encoding="utf-8") as f:
                    text = f.read()
            except OSError:
                continue
            if name.endswith(".py"):
                targets = _python_imports(rel, text, py_idx)
            else:
                targets = _js_imports(rel, text)
            graph[rel] = set(targets)
    return graph


def _reverse_graph(graph):
    rev = {k: set() for k in graph}
    for src, targets in graph.items():
        for t in targets:
            rev.setdefault(t, set()).add(src)
    return rev


def _blast_radius(rev, plan_files):
    plan_norm = {_norm_path(p) for p in plan_files}
    seen = set(plan_norm)
    queue = list(plan_norm)
    while queue:
        cur = queue.pop(0)
        for importer in rev.get(cur, ()):
            if importer not in seen:
                seen.add(importer)
                queue.append(importer)
    return sorted(seen - plan_norm)


def _size_band(n):
    if n <= 2:
        return "S"
    if n <= 6:
        return "M"
    return "L"


def _risk(blast_files, blast_count):
    protected = set(guard.PROTECTED)
    if any(any(b.startswith(p) for p in protected) for b in blast_files):
        return "high"
    if blast_count > 20:
        return "high"
    if blast_count > 8:
        return "medium"
    return "low"


def simulate(repo_root, plan_files):
    """Reverse-import blast radius for planned files."""
    graph = _build_graph(repo_root)
    rev = _reverse_graph(graph)
    blast = _blast_radius(rev, plan_files)
    blast_count = len(blast)
    return {
        "kind": "SIMULATE",
        "blast_files": blast,
        "blast_count": blast_count,
        "size_band": _size_band(len(plan_files)),
        "risk": _risk(blast, blast_count),
    }


def _read_capped(repo_root, rel, limit=200):
    path = os.path.join(repo_root, rel.replace("/", os.sep))
    try:
        with open(path, encoding="utf-8") as f:
            lines = []
            for i, line in enumerate(f):
                if i >= limit:
                    break
                lines.append(line.rstrip("\n"))
            return "\n".join(lines)
    except OSError:
        return ""


def explain(provider, model, task, plan_files, repo_root):
    """Summarize planned changes; never raises."""
    try:
        sim = simulate(repo_root, plan_files)
        snippets = []
        for pf in plan_files:
            body = _read_capped(repo_root, pf)
            if body:
                snippets.append(f"--- {pf} ---\n{body}")
        prompt = (
            "Summarize this coding plan for a human reviewer. "
            'Respond ONLY with JSON: {"summary": "...", "files": ["..."]}\n'
            f"Task: {task.get('title', '')}\n{task.get('prompt', '')}\n"
            f"Plan files: {plan_files}\n"
            f"Direct importers (blast): {sim['blast_files'][:20]}\n\n"
            + "\n\n".join(snippets)
        )
        raw = provider.generate(model, prompt, json_mode=True)
        obj = json.loads(raw)
        if isinstance(obj, dict) and obj.get("summary"):
            files = obj.get("files")
            if not isinstance(files, list):
                files = list(plan_files)
            return {"kind": "EXPLAIN", "summary": obj["summary"], "files": files}
    except Exception:
        pass
    return {"kind": "EXPLAIN", "summary": "(unavailable)", "files": list(plan_files)}
