#!/usr/bin/env bash
# Run E2E smoke under a named chaos profile via toxiproxy.
#
# Usage:
#   bash scripts/run-chaos-smoke.sh <profile-name>
#
# Prerequisites:
#   docker compose -f docker-compose.yml -f docker-compose.chaos.yml up -d
#
# Profiles: mongo-slow | redis-pause | rabbitmq-restart | mcp-data-unavailable
# See docs/superpowers/plans/CHAOS_VERIFICATION.md for the full runbook.
set -euo pipefail

PROFILE="${1:?usage: $0 <profile-name>}"
PROFILE_FILE="scripts/chaos-profiles/${PROFILE}.json"
TOXI_API="${TOXI_API:-http://localhost:8474}"

if [[ ! -f "$PROFILE_FILE" ]]; then
  echo "no such profile: $PROFILE_FILE" >&2
  echo "available: $(ls scripts/chaos-profiles/*.json | xargs -n1 basename | sed 's/\.json//')" >&2
  exit 1
fi

# mcp-data-unavailable is handled via docker stop/start (HTTP service, not a toxiproxy proxy).
if [[ "$PROFILE" == "mcp-data-unavailable" ]]; then
  echo "==> [chaos] stopping mcp-data for 30s"
  docker compose -f docker-compose.yml -f docker-compose.chaos.yml stop mcp-data
  trap 'docker compose -f docker-compose.yml -f docker-compose.chaos.yml start mcp-data; echo "==> [chaos] mcp-data restarted"' EXIT
  sleep 30
  echo "==> [chaos] running smoke under mcp-data outage"
  .venv/bin/python scripts/smoke_e2e.py
  exit $?
fi

PROXY=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['proxy'])" < "$PROFILE_FILE")
TOXICS=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['toxics']))" < "$PROFILE_FILE")

# Apply each toxic in the profile.
echo "==> [chaos] applying profile '$PROFILE' on proxy '$PROXY'"
echo "$TOXICS" | python3 -c "
import json, sys, urllib.request, urllib.error
toxics = json.load(sys.stdin)
base = '$TOXI_API'
proxy = '$PROXY'
for t in toxics:
    body = json.dumps(t).encode()
    req = urllib.request.Request(f'{base}/proxies/{proxy}/toxics', data=body,
                                  headers={'Content-Type': 'application/json'}, method='POST')
    try:
        urllib.request.urlopen(req)
        print(f'  applied: {t[\"name\"]}')
    except urllib.error.HTTPError as e:
        print(f'  WARN: {e.code} {e.read()}', file=sys.stderr)
"

# Collect toxic names for cleanup.
TOXIC_NAMES=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(t['name'] for t in d['toxics']))" < "$PROFILE_FILE")

cleanup() {
  echo "==> [chaos] removing toxics: $TOXIC_NAMES"
  for name in $TOXIC_NAMES; do
    curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY}/toxics/${name}" || true
  done
  echo "==> [chaos] cleanup complete"
}
trap cleanup EXIT

echo "==> [chaos] running smoke_e2e.py under '$PROFILE'"
# smoke_e2e.py must exist (extend scripts/smoke_login.py to cover the full hire funnel).
# If it does not exist yet, see CHAOS_VERIFICATION.md § "Authoring smoke_e2e.py".
if [[ ! -f "scripts/smoke_e2e.py" ]]; then
  echo "ERROR: scripts/smoke_e2e.py does not exist." >&2
  echo "See docs/superpowers/plans/CHAOS_VERIFICATION.md to author it (extends smoke_login.py)." >&2
  exit 1
fi

.venv/bin/python scripts/smoke_e2e.py
echo "==> [chaos] run complete: $PROFILE"
