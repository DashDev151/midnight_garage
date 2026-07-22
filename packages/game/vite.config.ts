import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    // The main chunk's measured eager floor is roughly 500 kB (vue + content
    // + sim, with Dexie split out); 600 sits just above it so a real
    // regression still warns.
    chunkSizeWarningLimit: 600,
  },
})
