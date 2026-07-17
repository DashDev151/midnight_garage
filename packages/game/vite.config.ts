import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    // The measured eager floor is roughly 500 kB (vue + content + sim) after
    // the Sprint 82 Dexie split; 600 calibrates just above that floor so a
    // real regression still warns (orchestrator ruling 2026-07-17).
    chunkSizeWarningLimit: 600,
  },
})
