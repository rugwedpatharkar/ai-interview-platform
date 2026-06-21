#!/usr/bin/env python3
"""Gate guard: flag any new uninstrumented external-call site.

Greps the codebase for ``await <ext>.<method>(...)`` patterns outside a
``with_timeout(...)`` context, compares against the allowlist, exits non-zero
on any non-allowlisted hit. See PRODUCTION_STANDARDS.md.

Pattern notes
-------------
- ``httpx\\.`` is intentionally narrowed to ``await\\s+httpx\\.`` to avoid
  false-positives on ``async with httpx.AsyncClient(timeout=N)`` constructors
  that already carry an inline timeout argument.
- ``await\\s+redis\\.`` excludes ``.aclose()`` calls (connection teardown, not
  a data operation) via the EXCLUDE_PATTERNS list.
"""

import argparse
import re
import sys
from pathlib import Path

DEFAULT_ROOTS = [
    "lib/lib",
    "src/admin/app",
    "src/ai-agents/app",
    "src/mcp-data/app",
    "src/mcp-capability/app",
]

EXTERNAL_PATTERNS = [
    re.compile(r"await\s+self\._collection\."),
    re.compile(r"await\s+self\._\w+\.(insert|find|update|delete|aggregate)"),
    re.compile(r"await\s+redis\."),
    re.compile(r"await\s+self\._r\."),
    re.compile(r"await\s+self\._redis\."),
    re.compile(r"await\s+self\._publisher\."),
    re.compile(r"await\s+httpx\."),
    re.compile(r"await\s+requests\."),
]

# Lines matching these are not external data calls (connection teardown, etc.)
EXCLUDE_PATTERNS = [
    re.compile(r"await\s+redis\.aclose\("),
    re.compile(r"await\s+self\._redis\.aclose\("),
]

WRAPPER_PATTERN = re.compile(r"with_timeout\s*\(")


def load_allowlist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    entries = []
    for raw in path.read_text().splitlines():
        entry = raw.strip()
        if not entry or entry.startswith("#"):
            continue
        entries.append(entry)
    return set(entries)


def scan(roots: list[Path], allow: set[str]) -> list[str]:
    violations = []
    for root in roots:
        if not root.exists():
            continue
        for py in root.rglob("*.py"):
            if "/pb/" in str(py) or "/tests/" in str(py):
                continue
            lines = py.read_text().splitlines()
            for i, line in enumerate(lines, start=1):
                if not any(p.search(line) for p in EXTERNAL_PATTERNS):
                    continue
                if any(p.search(line) for p in EXCLUDE_PATTERNS):
                    continue
                # A with_timeout( on the same line or the 2 preceding lines counts.
                window = "\n".join(lines[max(0, i - 3) : i])
                if WRAPPER_PATTERN.search(window):
                    continue
                rel = str(py)
                if f"{rel}:{i}" in allow:
                    continue
                violations.append(f"{rel}:{i}: {line.strip()}")
    return violations


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Flag uninstrumented external calls not in the allowlist."
    )
    ap.add_argument(
        "--root",
        action="append",
        default=None,
        metavar="PATH",
        help="Override scan root(s); may be repeated. Defaults to DEFAULT_ROOTS.",
    )
    ap.add_argument(
        "--allowlist",
        default="scripts/.timeouts_allowlist.txt",
        metavar="FILE",
        help="Path to the allowlist file (relative to cwd).",
    )
    args = ap.parse_args()

    repo = Path.cwd()
    if args.root:
        roots = [Path(r) for r in args.root]
    else:
        roots = [repo / r for r in DEFAULT_ROOTS]
    allow = load_allowlist(repo / args.allowlist)
    violations = scan(roots, allow)
    if violations:
        print(
            "uninstrumented external calls found"
            " (add with_timeout or update allowlist):"
        )
        for v in violations:
            print(f"  {v}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
