import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // 開発時は API を server/dev.ts（Node 上の Hono）へ転送する
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: { name: 'web', environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test-setup.ts'] },
      },
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['server/**/*.test.ts', 'shared/**/*.test.ts'] },
      },
    ],
  },
})
