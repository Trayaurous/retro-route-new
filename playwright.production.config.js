import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/static.spec.js', outputDir: './test-results/static', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174/retro-route/', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4174 --base /retro-route/ --strictPort', url: 'http://127.0.0.1:4174/retro-route/', reuseExistingServer: !process.env.CI },
});
