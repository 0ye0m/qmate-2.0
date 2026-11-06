import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Q-Mate 2.0 — pure frontend build. No server, no proxy, no backend.
// base '/qmate/' → the built bundle can be dropped into any static host
// sub-path (the sandbox preview serves it from Next.js /public/qmate/).
// Override with VITE_BASE=/ to build for a domain root.
export default defineConfig({
  base: process.env.VITE_BASE || '/qmate/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Q-Mate 2.0 — Sustainable Smart Campus Queue',
        short_name: 'Q-Mate',
        description: 'Virtual queue tokens for campus counters. Wait Less, Do More.',
        theme_color: '#0d9488',
        background_color: '#f0fdfa',
        display: 'standalone',
        start_url: '/',
        lang: 'en',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          qr: ['qrcode.react', 'html5-qrcode'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'dexie'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/tests/**/*.test.{js,jsx}'],
  },
});
