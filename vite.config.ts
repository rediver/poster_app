import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isThemeBuild = env.VITE_THEME_BUILD === '1'

  if (isThemeBuild) {
    // Build a single self-contained bundle for the Shopify theme assets directory
    return {
      plugins: [react()],
      build: {
        lib: {
          entry: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src/mount-theme.tsx'),
          name: 'PosterBuilder',
          formats: ['iife'],
          fileName: () => 'poster-builder.js',
        },
        outDir: 'assets',
        assetsDir: '.',
        emptyOutDir: false, // do not wipe existing theme assets
        sourcemap: false,
        cssCodeSplit: false, // emit a single CSS file (style.css)
        rollupOptions: {
          output: {
            inlineDynamicImports: true, // ensure a single JS bundle
          },
        },
      },
    }
  }

  // Default dev/preview for the standalone builder
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { port: 5174, strictPort: true },
  }
})

