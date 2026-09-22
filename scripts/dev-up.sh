#!/usr/bin/env bash
# Bring the full local stack up for e2e: Postgres + Redis + seeded DB + API + web.
# Idempotent and safe to re-run after a container recycle.
set -euo pipefail
ROOT="${DEV_UP_ROOT:-/home/user/cipansor}"
cd "$ROOT"

bash scripts/dev-stack.sh >/tmp/devstack.log 2>&1
PGBIN=/usr/lib/postgresql/16/bin

# .env (gitignored; recreated on fresh containers)
if [ ! -f apps/api/.env ]; then
cat > apps/api/.env <<'EOF'
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/cipansor?schema=public"
SHADOW_DATABASE_URL="postgresql://postgres@127.0.0.1:5432/cipansor_shadow?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="local-test-secret-key-for-verification-only"
# Production default is 15m; local dev/e2e pins 7d so cached e2e sessions
# (reused across runs by global-setup) don't expire mid-iteration.
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=error
EOF
fi

set -a; . apps/api/.env; set +a
export E2E_FIXED_2FA=1 TWO_FACTOR_RATE_LIMIT_MAX=100000 LOG_LEVEL=error

# Migrations ALWAYS run, then seed only when the database is empty. This is a
# separate script so its failure path is unit-testable with a stub `pnpm`; see
# `provisioning-script.test.ts`. A non-zero exit here aborts this script (set -e)
# and the API below is never started.
bash scripts/db-provision.sh

# Build web if missing
if [ ! -f apps/web/.next/BUILD_ID ]; then
  echo "Building web..."
  (cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm build) >/tmp/webbuild.log 2>&1 \
    && echo "web built" || { echo "WEB BUILD FAILED"; tail -8 /tmp/webbuild.log; }
fi

# Start API if not up
if ! curl -s -m 3 http://127.0.0.1:3001/health >/dev/null 2>&1; then
  (cd apps/api && nohup pnpm exec tsx src/main.ts >/tmp/api.log 2>&1 &)
  for i in $(seq 1 30); do curl -s -m 3 http://127.0.0.1:3001/health >/dev/null 2>&1 && break; sleep 2; done
fi
curl -s -m 3 http://127.0.0.1:3001/health >/dev/null 2>&1 && echo "API UP" || echo "API DOWN"

# Start web (prod) if not up
if ! curl -s -m 5 -o /dev/null http://127.0.0.1:3000/login 2>/dev/null; then
  (cd apps/web && nohup env PORT=3000 pnpm start >/tmp/web.log 2>&1 &)
  for i in $(seq 1 40); do curl -s -m 5 -o /dev/null http://127.0.0.1:3000/login 2>/dev/null && break; sleep 2; done
fi
curl -s -m 5 -o /dev/null http://127.0.0.1:3000/login 2>/dev/null && echo "WEB UP" || echo "WEB DOWN"
