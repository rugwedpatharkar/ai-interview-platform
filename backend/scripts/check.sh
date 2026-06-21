#!/usr/bin/env bash
# Production gate — run from anywhere: bash backend/scripts/check.sh
# Format, lint (incl. security S-rules), dependency CVE audit, and tests must all pass.
# See docs/superpowers/plans/PRODUCTION_STANDARDS.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUFF="$ROOT/.venv/bin/ruff"
PY="$ROOT/.venv/bin/python"
cd "$ROOT"

echo "==> ruff format (check)"
"$RUFF" format --check .

echo "==> ruff lint (incl. security S-rules)"
"$RUFF" check .

echo "==> robustness guards (timeouts + log-coverage)"
"$PY" "$ROOT/scripts/check_timeouts.py"
"$PY" "$ROOT/scripts/check_log_coverage.py"

echo "==> pip-audit (dependency CVEs)"
"$ROOT/.venv/bin/pip-audit"

echo "==> lib tests"
(cd lib && "$PY" -m pytest -q)

echo "==> admin tests"
(cd services/admin && "$PY" -m pytest -q)

echo "==> ai-agents tests"
(cd services/ai-agents && "$PY" -m pytest -q)

echo "==> mcp-data tests"
(cd services/mcp-data && "$PY" -m pytest -q)

echo "==> mcp-capability tests"
(cd services/mcp-capability && "$PY" -m pytest -q)

echo ""
echo "==> GATE PASSED"
