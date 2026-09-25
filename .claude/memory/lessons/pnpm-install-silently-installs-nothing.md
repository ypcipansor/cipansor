# pnpm-install-silently-installs-nothing

> `pnpm install --frozen-lockfile` can exit 0 having installed nothing, when a container mounts the repo at a different path than the last install did. Set `CI=true`, and prove the package is there.

**The symptom misleads.** `pnpm install --frozen-lockfile` prints only
`Scope: all 4 workspace projects`, **exits 0**, and installs nothing. Then
`tsc` fails with `TS2307: Cannot find module '<new package>'` although the
package is in `package.json` **and** in `pnpm-lock.yaml`.

**The cause** is in `node_modules/.modules.yaml`: it records the absolute
`storeDir` of the previous install (say `/app/.pnpm-store/v3`, from a container
that mounted the repo at `/app`). When the next container mounts it at `/w`,
pnpm thinks the store moved and **asks**:

```
? The modules directories will be removed and reinstalled from scratch. Proceed? (Y/n)
```

With no TTY nobody answers, and the process exits 0.

**The fix:** `-e CI=true` on the `docker run` (pnpm goes non-interactive and
proceeds), or `--config.confirmModulesPurge=false`. The API Dockerfile never
hits it because the image sets `ENV CI=true`, and CI never sees it because it
always installs into a clean tree.

**The wider lesson:** an installer's `exit 0` is not evidence anything was
installed. The proof is two cheap lines:

```bash
ls node_modules/.pnpm | grep -c <package-name>
ls apps/api/node_modules/<scope>
```

Hit 2026-09-12 while merging `main` into a branch that added
`@pdf-lib/fontkit`.
