#!/usr/bin/env bash
# Rejects em dashes and en dashes anywhere in tracked source.
# House style: use a comma, a colon, parentheses, or a full stop instead.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

# docs/evidence holds verbatim captured output from real runs, including the model's
# own words. Those are records, and editing punctuation inside a record would be
# falsifying it, so they are exempt.
hits=$(git ls-files -z \
  | xargs -0 grep -nIP '\x{2014}|\x{2013}' 2>/dev/null \
  | grep -v '^scripts/check-dashes.sh:' \
  | grep -v '^docs/evidence/' || true)

if [ -n "$hits" ]; then
  echo "Found em/en dashes. Replace them with a comma, colon, parentheses, or full stop:"
  echo "$hits"
  exit 1
fi
echo "No em or en dashes found."
