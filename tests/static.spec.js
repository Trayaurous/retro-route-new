import { test, expect } from '@playwright/test';

test('production build works in a Pages project subdirectory without an API', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGJ8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('./');
  await page.getByRole('button', { name: 'New Route', exact: true }).click();
  await page.getByRole('button', { name: 'Files & transfer' }).click();
  await page.getByRole('button', { name: 'Show QR', exact: true }).click();
  await expect(page.getByAltText('Retro Route transfer QR code')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Files & transfer' }).click();
  await page.getByRole('button', { name: 'Scan QR / Image', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.locator('.route-name')).toHaveText('Route 1');
  expect(requests.filter(url => /5001|\/api\//.test(url))).toEqual([]);
  expect(requests.filter(url => url.includes('/assets/')).every(url => url.includes('/retro-route/assets/'))).toBe(true);
  expect(errors).toEqual([]);
});
