# Plotline v0.2.0 — 2026-07-17

First release with working Linux packages.

## Added

- `## Building (Linux)` section in README: prerequisites, build commands, output paths, and package structure notes.

## Changed

- `.gitignore`: added patterns for worktrees (`.worktrees/`, `.slim/worktrees/`), ESLint cache (`.eslintcache`), general tool caches (`.cache/`), additional archive formats (`*.tar.gz`, `*.zip`), and electron-updater manifests (`latest*.yml`).

## Fixed

- **AppImage failed to launch with `Cannot find module '@mixmark-io/domino'`.** Vite externalized transitive dependencies (`turndown` → `linkedom` → `@mixmark-io/domino`) at build time, but Electron Forge didn't copy production `node_modules` into the packaged app. Fixed by running `npm install --omit=dev` inside `resources/app/` via the Forge `afterComplete` hook.
- **AppImage showed `ERR_FILE_NOT_FOUND` for renderer HTML.** `vite.renderer.config.ts` had `outDir` set relative to `src/renderer/`, so renderer output landed at `src/dist/renderer/` instead of `.vite/renderer/main_window/` where the Forge Vite plugin expects it. Fixed by resolving `outDir` to the absolute project-relative path.
- **AppImage failed to build because binary name didn't match.** `packagerConfig.name: 'Plotline'` produced an uppercase binary, but `@reforged/maker-appimage` looks for lowercase `plotline`. Fixed by setting `packagerConfig.executableName: 'plotline'`.
- **AppImage crashed on launch with Chromium `setuid_sandbox_host.cc` error.** Electron's Chromium sandbox cannot execute inside the read-only squashfs. The AGENTS.md-prescribed `runtime` config option runs before squashfs mounts, so the wrapper script couldn't find the binary. Fixed by removing `runtime` and using `afterComplete` to rename `plotline` → `plotline.bin` and write a shell wrapper that passes `--no-sandbox`.
- **`vendor/tectonic/` missing at build time.** Tectonic (PDF export engine) must be downloaded before `npm run build`. Fixed by running `scripts/download-tectonic.sh` and documenting it as a build prerequisite.

## Known issues

- AppImage runs with `--no-sandbox` for Chromium (applied automatically). The renderer remains sandboxed via Electron context isolation. See D0XX in `DECISIONS.md`.
