import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const repository = path.resolve(process.cwd());
export default defineConfig({
  root: path.join(repository, 'test-only/ui-harness'),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@/services/api/recoveryApi', replacement: path.join(repository, 'test-only/ui-harness/recoveryApi.fixture.ts') },
      { find: '@', replacement: path.join(repository, 'src') },
    ],
  },
  build: { outDir: path.join(repository, 'dist-recovery-ui'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
