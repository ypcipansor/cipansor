# syntax=docker/dockerfile:1
# Cipansor API — multi-stage production image.
#
# The runner carries a fresh production-only dependency install (dev deps are
# never installed, so nothing to prune) plus the compiled JS and the generated
# Prisma client. The deps/prod-deps stages copy only the api + shared manifests
# (never web), so web deps are never installed either.
#
# Behind a TLS-terminating egress proxy, pass the proxy CA as a build secret:
#   docker build --secret id=proxyca,src=<ca.crt> -f apps/api/Dockerfile -t cipansor-api .
# In a normal network the secret is unused and the build works without it.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
WORKDIR /app
RUN --mount=type=secret,id=proxyca,required=false \
    if [ -f /run/secrets/proxyca ]; then \
      cat /run/secrets/proxyca >> /etc/ssl/certs/ca-certificates.crt; \
    fi && \
    NODE_EXTRA_CA_CERTS=/run/secrets/proxyca corepack enable && \
    NODE_EXTRA_CA_CERTS=/run/secrets/proxyca corepack prepare pnpm@9.0.0 --activate

# Manifests only (api + shared; web is intentionally omitted).
FROM base AS manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# ---- deps: full install (incl. dev) so we can build ----
FROM manifests AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=proxyca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/proxyca pnpm install --frozen-lockfile

# ---- prod-deps: fresh production-only install for the runtime image ----
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=proxyca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/proxyca pnpm install --frozen-lockfile --prod

# ---- builder: compile shared + api, generate the Prisma client ----
FROM base AS builder
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN --mount=type=secret,id=proxyca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/proxyca pnpm --filter @cipansor/shared build \
 && NODE_EXTRA_CA_CERTS=/run/secrets/proxyca pnpm --filter api db:generate \
 && pnpm --filter api build
# Stage the generated Prisma client + its `.prisma` artifacts (both live inside
# the @prisma/client package dir in pnpm's virtual store).
RUN set -e; \
    STORE="$(find /app/node_modules/.pnpm -maxdepth 1 -type d -name '@prisma+client@*' | head -1)/node_modules"; \
    cp -RL "$STORE/@prisma/client" /tmp/prisma-client; \
    cp -RL "$STORE/.prisma" /tmp/dot-prisma

# ---- assemble: overlay the generated client into the prod-deps store ----
FROM prod-deps AS assemble
COPY --from=builder /tmp/prisma-client /tmp/prisma-client
COPY --from=builder /tmp/dot-prisma /tmp/dot-prisma
RUN set -e; \
    STORE="$(find /app/node_modules/.pnpm -maxdepth 1 -type d -name '@prisma+client@*' | head -1)/node_modules"; \
    cp -RL /tmp/prisma-client/. "$STORE/@prisma/client/"; \
    rm -rf "$STORE/.prisma"; cp -RL /tmp/dot-prisma "$STORE/.prisma"; \
    rm -rf /tmp/prisma-client /tmp/dot-prisma

# Strip build-time-only weight from the runtime dependency closure. This was 302
# of the 501MB of node_modules — none of it reachable from `node dist/main.js`,
# and it took the image from 910MB to 581MB:
#
#   *.d.ts (79MB)  TypeScript declarations. Node never loads them; only tsc
#                  does, and tsc already ran back in the `builder` stage.
#   *.map  (66MB)  Source maps belonging to third-party packages. Nothing turns
#                  on --enable-source-maps, and the api's own dist maps are
#                  copied separately from `builder`, so they are untouched.
#   the prisma CLI cluster (158MB): prisma, @prisma/studio-core, effect,
#                  @electric-sql/pglite, typescript. @prisma/client declares
#                  `prisma` as an OPTIONAL peer, yet the lockfile pins the
#                  peer-resolved variant `@prisma/client@7.8.0_prisma@7.8.0_…`,
#                  so `pnpm install --prod` materialises the peer regardless.
#                  Nothing in dist/ imports any of the five. Schema work
#                  (db:push / db:generate / seed) never runs from this image —
#                  it runs against a full dev install elsewhere.
#
# Verify after changing this: run the image against a real database and hit an
# endpoint that queries. A dangling peer symlink only fails when something
# actually requires it, so a green build proves nothing by itself.
RUN set -e; \
    find /app/node_modules -type f \( -name '*.d.ts' -o -name '*.map' \) -delete; \
    rm -rf /app/node_modules/.pnpm/prisma@* \
           /app/node_modules/.pnpm/@prisma+studio-core@* \
           /app/node_modules/.pnpm/effect@* \
           /app/node_modules/.pnpm/@electric-sql+pglite@* \
           /app/node_modules/.pnpm/typescript@*

# ---- runner: minimal production image ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
RUN addgroup -S nodejs -g 1001 && adduser -S expressjs -u 1001

# Production-only dependency closure (api + shared; generated Prisma client).
COPY --from=assemble --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=assemble --chown=expressjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=assemble --chown=expressjs:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules

# Compiled output + runtime assets.
COPY --from=builder --chown=expressjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=expressjs:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=expressjs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=expressjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=expressjs:nodejs /app/packages/shared/package.json ./packages/shared/

# Runtime-written directories, created and owned here rather than left to the
# app. It writes `logs/` and `public/uploads/` relative to its cwd, and until
# now that only worked by accident: BuildKit chowns the parent directories it
# implicitly creates for a `COPY --chown`, so /app/apps/api came out owned by
# expressjs. Under the classic builder those parents are root-owned, the very
# first mkdir fails with EACCES, and the process exits before it serves a
# request. Chown the directories themselves only — a recursive chown over
# node_modules would rewrite the largest layer in the image for nothing.
#
# `private/identity/` holds scans of KTP and is created here for a second
# reason: a named volume mounted onto a path the image does not contain is
# created by Docker as root, and the very first upload then fails with EACCES
# from a process running as expressjs. Its 0700 is not decoration — the
# directory is deliberately outside `public/`, so nothing serves it statically,
# and the only reader is an endpoint that checks the caller's role and logs the
# read.
RUN mkdir -p /app/apps/api/logs /app/apps/api/public/uploads /app/apps/api/private/identity \
 && chown expressjs:nodejs \
      /app /app/apps /app/apps/api \
      /app/apps/api/logs /app/apps/api/public /app/apps/api/public/uploads \
      /app/apps/api/private /app/apps/api/private/identity \
 && chmod 700 /app/apps/api/private /app/apps/api/private/identity

USER expressjs
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
