import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (ESM + CJS)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['ethers'],
  },
  // CLI build (ESM only, with banner for shebang)
  {
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    outDir: 'dist/cli',
    banner: { js: '#!/usr/bin/env node' },
    external: ['ethers'],
    noExternal: ['@noble/curves', '@noble/hashes', '@noble/ciphers'],
  },
]);
