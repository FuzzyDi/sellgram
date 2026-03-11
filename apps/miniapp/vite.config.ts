import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    allowedHosts: [
      'miniapp.sellgram.uz',
      'localhost',
    ],
    proxy: {
      '/api': 'http://localhost:4000',
      '/webhook': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
