#!/usr/bin/env bash
set -euo pipefail

# Resolve paths from the checkout, even when launched from another directory.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
  echo "Create .env with your JevKey first (see .env.example)." >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "Install pnpm before running this script." >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  echo "Run 'pnpm install' first to install the game dependencies." >&2
  exit 1
fi

# Give each service a process group so cleanup also stops pnpm's children.
set -m
service_pids=()

# Stop both service trees on Ctrl+C, termination, or either service exiting.
cleanup() {
  for pid in "${service_pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting the Jev relay and game at http://localhost:5173"
echo "Press Ctrl+C to stop both."

pnpm dev:relay &
service_pids+=("$!")

# Keep the frontend on the origin allowed by the local relay.
pnpm dev --port 5173 --strictPort &
service_pids+=("$!")

wait -n "${service_pids[@]}"
