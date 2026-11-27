import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Change this (and RewriteBase in public/.htaccess) if the site lives in a subfolder.
  base: '/',
  plugins: [react()],
  build: {
    // three.js alone is larger than the default warning limit.
    chunkSizeWarningLimit: 1200,
  },
})
