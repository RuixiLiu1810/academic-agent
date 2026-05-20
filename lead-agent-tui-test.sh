#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TSX_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
if [[ ! -x "$TSX_BIN" ]]; then
  echo "tsx not found at $TSX_BIN. Run npm install from the repo root first." >&2
  exit 1
fi

PI_LEAD_AGENT_DEBUG="${PI_LEAD_AGENT_DEBUG:-1}" "$TSX_BIN" "$SCRIPT_DIR/packages/lead-agent/src/cli.ts" --mode interactive "$@"
