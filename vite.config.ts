import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Preview tools assign a free port via PORT; default stays 5173.
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about/index.html'),
      },
    },
  },
});
