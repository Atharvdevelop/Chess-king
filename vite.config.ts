import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        lobby: resolve(__dirname, 'pages/lobby.html'),
        play: resolve(__dirname, 'pages/play.html'),
        challenge: resolve(__dirname, 'pages/challenge.html'),
        player: resolve(__dirname, 'pages/player.html'),
      },
    },
  },
});
