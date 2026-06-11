#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1 && [ -x /opt/homebrew/opt/node@22/bin/node ]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

npm run build:frontend
npm test
forge lint
forge deploy -e production
