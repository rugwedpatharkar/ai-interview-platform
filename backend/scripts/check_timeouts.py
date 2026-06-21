#!/usr/bin/env python3
"""Gate guard: flag any new uninstrumented external-call site.

Greps the codebase for ``await <ext>.<method>(...)`` patterns outside a
``with_timeout(...)`` context, compares against the allowlist, exits non-zero
on any non-allowlisted hit. See PRODUCTION_STANDARDS.md.

Pattern notes
-------------
- Patterns match only the exact pymongo / redis / httpx verb names followed by
  ``(`` so that repository wrapper methods (``delete_by_applications``,
  ``find_by_candidate``, etc.) and publisher calls (``publish``, ``notify``)
  are not flagged.  Those wrappers call ``with_timeout`` internally.
- ``httpx\\.`` is intentionally narrowed to ``await\\s+httpx\\.`` to avoid
  false-positives on ``async with httpx.AsyncClient(timeout=N)`` constructors
  that already carry an inline timeout argument.
- ``lib/lib/audit.py`` is excluded because it IS the helper; callers control
  retry / timeout at the call site.
"""

import argparse
import re
import sys
from pathlib import Path

DEFAULT_ROOTS = [
    "lib/lib",
    "services/admin/app",
    "services/ai-agents/app",
    "services/mcp-data/app",
    "services/mcp-capability/app",
]

# Exact pymongo verb names — repo wrapper methods (delete_by_*, find_by_*,
# insert_bulk, etc.) do NOT match because they don't end with these exact names
# followed by ``(``.
_PYMONGO_VERBS = (
    "insert_one|insert_many|"
    "find_one|find|"
    "update_one|update_many|"
    "delete_one|delete_many|"
    "count_documents|estimated_document_count|distinct|"
    "aggregate|bulk_write|replace_one|find_one_and_update|"
    "find_one_and_replace|find_one_and_delete"
)

# Exact redis verb names — ``publish`` is a redis primitive listed here so it
# matches on redis client references but NOT on ``self._publisher.publish``
# (which routes through a wrapper); the redis patterns require the receiver to
# be a known redis variable name (_r, _redis, or a bare ``redis.`` module ref).
_REDIS_VERBS = (
    "set|get|mget|delete|exists|expire|ttl|incr|decr|"
    "hset|hget|hgetall|hdel|hexists|hmget|hmset|"
    "sadd|srem|sismember|smembers|scard|spop|"
    "rpush|lpush|lpop|rpop|lrange|llen|lrem|"
    "zadd|zrem|zrange|zincrby|zscore|zcard|"
    "publish|subscribe|scan_iter|pipeline"
)

EXTERNAL_PATTERNS = [
    # pymongo: direct collection access via self._collection or any _<name> attr
    re.compile(rf"await\s+self\._collection\.({_PYMONGO_VERBS})\("),
    re.compile(rf"await\s+self\._\w+\.({_PYMONGO_VERBS})\("),
    # redis: module-level or injected client references only
    re.compile(rf"await\s+redis\.({_REDIS_VERBS})\("),
    re.compile(rf"await\s+self\._r\.({_REDIS_VERBS})\("),
    re.compile(rf"await\s+self\._redis\.({_REDIS_VERBS})\("),
    # httpx
    re.compile(r"httpx\.AsyncClient\("),
    re.compile(r"await\s+httpx\.(get|post|put|delete|patch|request)\("),
    re.compile(r"requests\.(get|post|put|delete|patch|request)\("),
]

# Files that are themselves timeout/retry helpers — callers own the instrumentation.
_FILE_EXCLUDES = {
    Path("lib/lib/audit.py"),  # audit helper — callers control retry/timeout
}

# Lines matching these are not external data calls (connection teardown, etc.)
EXCLUDE_PATTERNS = [
    re.compile(r"await\s+redis\.aclose\("),
    re.compile(r"await\s+self\._redis\.aclose\("),
]

# Pattern for httpx.AsyncClient calls that already carry an inline timeout= arg.
# Checked against a 2-line window (current line + next) to handle multi-line calls.
_HTTPX_CLIENT_PATTERN = re.compile(r"httpx\.AsyncClient\(")
_HTTPX_TIMEOUT_PATTERN = re.compile(r"timeout=")

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
            try:
                rel_to_repo = py.resolve().relative_to(Path.cwd().resolve())
                if rel_to_repo in _FILE_EXCLUDES:
                    continue
            except ValueError:
                pass
            lines = py.read_text().splitlines()
            for i, line in enumerate(lines, start=1):
                if not any(p.search(line) for p in EXTERNAL_PATTERNS):
                    continue
                if any(p.search(line) for p in EXCLUDE_PATTERNS):
                    continue
                # httpx.AsyncClient( with timeout= on the same or next line is
                # already instrumented — skip.  Multi-line calls split the args
                # across lines, so we look one line ahead.
                if _HTTPX_CLIENT_PATTERN.search(line):
                    lookahead = "\n".join(lines[i - 1 : i + 1])
                    if _HTTPX_TIMEOUT_PATTERN.search(lookahead):
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
