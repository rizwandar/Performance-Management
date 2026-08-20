import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  build: {
    rollupOptions: {
      // MKT-02: campaign landing pages under client/lp/ are registered as
      // their own Vite entries (not raw public/ files) specifically so
      // import.meta.env.VITE_API_URL resolves the same way it does
      // everywhere else in the client - no hardcoded API domain in a static
      // file. They stay React-free (plain HTML/CSS/vanilla JS) since nothing
      // in client/lp/ imports React.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'lp-adult-children': path.resolve(__dirname, 'lp/adult-children.html'),
        'lp-self-planners': path.resolve(__dirname, 'lp/self-planners.html'),
        'lp-life-event': path.resolve(__dirname, 'lp/life-event.html'),
        'lp-caregivers': path.resolve(__dirname, 'lp/caregivers.html'),
      },
    },
  },
})
