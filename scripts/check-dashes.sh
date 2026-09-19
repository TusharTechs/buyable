#!/usr/bin/env bash
# Rejects em dashes and en dashes anywhere in tracked source.
# House style: use a comma, a colon, parentheses, or a full stop instead.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

hits=$(git ls-files -z \
  | xargs -0 grep -nIP '\x{2014}|\x{2013}' 2>/dev/null \
  | grep -v '^scripts/check-dashes.sh:' || true)

if [ -n "$hits" ]; then
  echo "Found em/en dashes. Replace them with a comma, colon, parentheses, or full stop:"
  echo "$hits"
  exit 1
fi
echo "No em or en dashes found."
