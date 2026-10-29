import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/routine/', // GitHub Pages serves the site at zaratek.github.io/routine/
})
