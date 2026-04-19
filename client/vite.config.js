import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@in-good-hands/shared': path.resolve(__dirname, '../shared'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
