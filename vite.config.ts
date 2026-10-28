import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // three is large by nature; warn only if a chunk grows well past it.
    chunkSizeWarningLimit: 700,
  },
});
