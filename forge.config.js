const { VitePlugin } = require('@electron-forge/plugin-vite');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    name: 'Plotline',
    executableName: 'plotline',
    icon: './assets/icon',
    afterComplete: [
      (buildPath, _electronVersion, platform, _arch, callback) => {
        if (platform !== 'linux') {
          callback();
          return;
        }
        try {
          // 1. AppImage Chromium SUID sandbox workaround (AGENTS.md §11):
          //    Rename Electron binary + create --no-sandbox wrapper script.
          const binPath = path.join(buildPath, 'plotline');
          const binRealPath = path.join(buildPath, 'plotline.bin');
          fs.renameSync(binPath, binRealPath);
          fs.writeFileSync(
            binPath,
            '#!/bin/sh\n' +
            'HERE="$(dirname "$(readlink -f "$0")")"\n' +
            'exec "$HERE/plotline.bin" --no-sandbox "$@"\n',
            { mode: 0o755 },
          );

          // 2. Install production node_modules — Vite externalizes some deps
          //    (e.g. @mixmark-io/domino) that must be present at runtime.
          const appDir = path.join(buildPath, 'resources', 'app');
          execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
            cwd: appDir,
            stdio: 'inherit',
            timeout: 120_000,
          });
        } catch (err) {
          callback(err);
          return;
        }
        callback();
      },
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Plotline',
          homepage: 'https://plotline.app',
        },
      },
    },
    {
      name: '@reforged/maker-appimage',
      config: {
        options: {},
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: { name: 'Plotline' },
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};
