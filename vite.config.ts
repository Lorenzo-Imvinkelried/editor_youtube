import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localAudioVaultPlugin } from './viteLocalAudioVaultPlugin.mjs';

export default defineConfig({
  plugins: [react(), localAudioVaultPlugin()],
  server: {
    port: 5173
  }
});
