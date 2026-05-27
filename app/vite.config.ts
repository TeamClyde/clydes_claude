import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Japanese Learn',
        short_name: 'JPLearn',
        description: 'Local-first Japanese practice with pitch analysis',
        theme_color: '#e11d48',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        // TODO: add proper rasterized 192/512 PNG icons (svg-only manifests work but
        // some installers prefer PNGs). Re-generate from a final logo design.
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
