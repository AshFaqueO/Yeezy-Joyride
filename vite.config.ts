import { defineConfig } from 'vite';

// base './' makes every asset URL relative, so the same dist/ folder works inside
// itch.io's nested iframe path and at a Vercel root domain.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          return id.includes('node_modules/phaser') ? 'phaser' : undefined;
        },
      },
    },
  },
});
