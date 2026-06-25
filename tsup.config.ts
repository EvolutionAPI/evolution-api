import { cpSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'tsup';

// Prisma 7: o generator `prisma-client` emite TS em prisma/generated/client.
// O alias `@prisma/client` (tsconfig) é honrado pelo tsx, mas NÃO pelo esbuild/tsup,
// então o reforçamos aqui para o client gerado ser bundlado (em vez do pacote real,
// que não deve ser importado diretamente no v7). O runtime (@prisma/client/runtime/*)
// permanece externo (node_modules) por ser dependência.
// Build-time licensing URL — passed via env vars only at build time, baked
// into the bundle by `define`. See src/licensing/endpoint.ts.
const licenseEndpointEncoded = JSON.stringify(process.env.LICENSE_ENDPOINT_ENCODED ?? '');
const licenseEndpointXorKey = JSON.stringify(process.env.LICENSE_ENDPOINT_XOR_KEY ?? '');

export default defineConfig({
  entry: ['src'],
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  format: ['cjs', 'esm'],
  // shims: injeta o shim de import.meta.url no bundle CJS (necessário p/ o client Prisma 7)
  shims: true,
  // Apenas o nome exato @prisma/client é bundlado (redirecionado pelo alias para o client
  // gerado). Subpaths como @prisma/client/runtime/* permanecem externos (node_modules).
  noExternal: [/^@prisma\/client$/],
  define: {
    __LICENSE_ENDPOINT_ENCODED__: licenseEndpointEncoded,
    __LICENSE_ENDPOINT_XOR_KEY__: licenseEndpointXorKey,
  },
  esbuildOptions(options) {
    // platform node: garante o shim de import.meta.url no bundle CJS (client Prisma 7 usa import.meta)
    options.platform = 'node';
    options.alias = {
      ...(options.alias ?? {}),
      '@prisma/client': path.resolve(process.cwd(), 'prisma/generated/client/client.ts'),
    };
  },
  onSuccess: async () => {
    cpSync('src/utils/translations', 'dist/translations', { recursive: true });
  },
  loader: {
    '.json': 'file',
    '.yml': 'file',
  },
});
