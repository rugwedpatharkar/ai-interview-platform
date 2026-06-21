#!/usr/bin/env python3
"""Gate guard: every `async def` in src/admin/app/resources/*.py must wrap its body in
`async with log_context(...)`. Allowlist file holds known unwrapped sites that Phase 2
shrinks file-by-file.
"""

import argparse
import ast
import sys
from pathlib import Path

DEFAULT_RESOURCES_ROOT = "src/admin/app/resources"


def load_allowlist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    out = set()
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.add(line)
    return out


def _starts_with_log_context(fn: ast.AsyncFunctionDef) -> bool:
    if not fn.body:
        return False
    first = fn.body[0]
    if isinstance(first, ast.AsyncWith):
        for item in first.items:
            call = item.context_expr
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Name)
                and call.func.id == "log_context"
            ):
                return True
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == "log_context"
            ):
                return True
    return False


def scan(root: Path, allow: set[str], repo: Path) -> list[str]:
    violations = []
    if not root.exists():
        return violations
    for py in root.rglob("*.py"):
        if py.name == "__init__.py":
            continue
        try:
            tree = ast.parse(py.read_text())
        except SyntaxError:
            continue
        try:
            rel = py.resolve().relative_to(repo.resolve())
        except ValueError:
            rel = py
        for node in ast.walk(tree):
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            if node.name.startswith("_"):
                continue
            if _starts_with_log_context(node):
                continue
            key = f"{rel}:{node.lineno}:{node.name}"
            if key in allow:
                continue
            violations.append(key)
    return violations


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--resources-root", default=DEFAULT_RESOURCES_ROOT)
    ap.add_argument("--allowlist", default="scripts/.log_coverage_allowlist.txt")
    ap.add_argument(
        "--seed", action="store_true", help="Print current violations to stdout"
    )
    args = ap.parse_args()

    repo = Path.cwd()
    root = Path(args.resources_root)
    if not root.is_absolute():
        root = repo / root
    allow = set() if args.seed else load_allowlist(repo / args.allowlist)
    violations = scan(root, allow, repo)
    if args.seed:
        for v in violations:
            print(v)
        return 0
    if violations:
        print("resource functions missing `async with log_context(...)`:")
        for v in violations:
            print(f"  {v}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
