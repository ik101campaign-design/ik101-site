import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://ik101.org',
  integrations: [sitemap()],
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  build: { inlineStylesheets: 'auto' },
  vite: {
    resolve: {
      alias: {
        // three-globe's ESM build optionally imports 'three/webgpu' and 'three/tsl'
        // for GPU acceleration; stub them out so the build succeeds without WebGPU.
        'three/webgpu': path.resolve(__dirname, 'src/lib/three-webgpu-stub.js'),
        'three/tsl': path.resolve(__dirname, 'src/lib/three-webgpu-stub.js'),
      },
    },
  },
});
