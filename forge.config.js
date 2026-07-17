const { VitePlugin } = require('@electron-forge/plugin-vite');
const path = require('path');

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    name: 'Plotline',
    icon: './assets/icon',
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
        options: {
          runtime: path.join(__dirname, 'scripts', 'apprun.sh'),
        },
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
