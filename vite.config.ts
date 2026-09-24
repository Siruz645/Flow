import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'flow-sdk': path.resolve(__dirname, 'src/mock-flow-sdk.ts')
    }
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    open: true
  }
});
