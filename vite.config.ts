import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localAudioVaultPlugin } from './viteLocalAudioVaultPlugin.mjs';
import { localEdgeTtsPlugin } from './viteEdgeTtsPlugin.mjs';

export default defineConfig({
  plugins: [react(), localAudioVaultPlugin(), localEdgeTtsPlugin()],
  server: {
    port: 5173
  }
});
