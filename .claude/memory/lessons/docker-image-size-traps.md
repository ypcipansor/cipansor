# docker-image-size-traps

> Three things that silently doubled the images: Prisma's optional peer dragging its CLI into a `--prod` install, `chown -R` after `COPY`, and a recursive `*.sql` in `.dockerignore` that empties every migration.

Measured 2026-07-24 (#372): api 910 → 581 MB, web 640 → 435 MB. Both images
were already multi-stage; the weight came from three non-obvious places.

**1. `@prisma/client` drags the whole Prisma CLI into a `--prod` install.** It
declares `prisma` an *optional* peer, but the lockfile pins the peer-resolved
identity, so `pnpm install --frozen-lockfile --prod` installs it anyway —
~158 MB of `prisma`, `@prisma/studio-core`, `effect`, `@electric-sql/pglite`
and `typescript` (Studio is a React app, so `react-dom` lands in a headless
API image too). Nothing in `dist/` imports them. Since 2026-09-23 the CLI itself
stays on purpose (`prisma`, `effect`, `@prisma/studio-core`, ~100 MB), because
the container runs `prisma migrate deploy` when it starts; the `assemble` stage
still strips the CLI's dev-only weight, such as `@electric-sql/pglite`. Read the
comment block there before changing either list.

**2. `RUN chown -R` after `COPY` pays for the tree twice.** overlayfs answers a
metadata change with a copy-up of every file, so `COPY . .` + `chown -R` put
the same content in two layers. Use `COPY --chown=` and keep any later `chown`
non-recursive. When an image looks fat, diff the Dockerfile you actually built
with against the repo's before blaming the repo.

**3. Never put `**/*.sql` in `.dockerignore`.** Every Prisma migration is a
file named `migration.sql`, so a recursive rule ships empty migration
directories and `migrate deploy` fails as unexplained drift, with no warning at
build time. Root-anchored `/*.sql` is safe — Docker uses Go's `filepath.Match`,
where `*` never crosses `/`. The same rule means `*.md` and `*.log` there only
ever match the repo root.

**Proving a slimmed image.** A green build proves nothing: a dangling peer
symlink fails only when something `require`s it. Run the image against a real
database and hit endpoints that query — `/health`, a login, a listing with
relations — then grep the log for `MODULE_NOT_FOUND`.
