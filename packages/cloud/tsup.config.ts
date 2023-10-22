import type { Options } from 'tsup';

export const tsup: Options = {
  outDir: 'dist',
  clean: false,
  dts: false,
  format: ['cjs'],
  minify: true,
  entry: ['src/index.ts'],
  target: 'es2021',
};
