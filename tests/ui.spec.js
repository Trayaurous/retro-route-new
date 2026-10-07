import { test, expect } from '@playwright/test';
import { freshRoute, uid } from '../src/domain/routes.js';
import { routeFile } from '../src/transfer/files.js';
import { readFile } from 'node:fs/promises';

const key = 'retroRoute.workspace.v1';
function seeded() {
  const route = freshRoute('Test Trip');
  route.locations = [{ id: uid(), name: 'Hotel', lat: 35.6812, lng: 139.7671, crs: 'WGS84', category: 'stay', notes: 'Arrive at 15:00', url: '' }, { id: uid(), name: 'Station', lat: 35.69, lng: 139.77, crs: 'WGS84', category: 'food', notes: '', url: '' }];
  route.stops = route.locations.map(p => ({ id: uid(), locationId: p.id })); return route;
}
async function seed(page, route = seeded()) {
  await page.addInitScript(({ key, route }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, revision: 'seed', savedAt: new Date().toISOString(), routes: [route], currentId: route.id })); }, { key, route });
  return route;
}
test.beforeEach(async ({ context }) => {
  // Do not fetch or automate panning against public tile servers in tests.
  await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGJ8AAAAASUVORK5CYII=', 'base64') }));
  await context.route('https://www.google.com/maps/**', route => route.fulfill({ status: 200, body: 'Navigation URL test' }));
  await context.route('https://maps.apple.com/**', route => route.fulfill({ status: 200, body: 'Navigation URL test' }));
});

test('desktop edits, saves, exports and reimports through preview', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New Route', exact: true }).click();
  await page.getByRole('button', { name: 'Add Location', exact: true }).click();
  await page.getByLabel('Location name').fill('Tokyo Hotel');
  await page.getByLabel('Latitude').fill('35.6812'); await page.getByLabel('Longitude').fill('139.7671');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Add Tokyo Hotel to sequence' }).click();
  await page.getByRole('button', { name: 'Add location on map' }).click();
  await page.locator('.map-canvas').click({ position: { x: 280, y: 190 } });
  await page.getByLabel('Location name').fill('Station'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Add Station to sequence' }).click();
  await page.getByRole('button', { name: 'Execute', exact: true }).click();
  await page.locator('.segment-title').click();
  await page.getByLabel('Departure').fill('23:30'); await page.getByLabel('Duration').fill('25:45');
  await expect(page.getByLabel('Arrival', { exact: true })).toHaveValue('01:15');
  await expect(page.getByLabel('Arrival day offset')).toHaveValue('2');
  await page.getByRole('button', { name: 'Flight', exact: true }).click(); await page.getByLabel('Gate', { exact: true }).fill('B22');
  await expect(page.locator('.save-status')).toHaveText('Saved');
  await page.reload(); await expect(page.locator('.location-name')).toHaveCount(2);
  await page.getByRole('button', { name: 'Files & transfer' }).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Route', exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toMatch(/retro-route.json$/);
  const path = await download.path(); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByRole('dialog')).toContainText('2 locations · 2 stops · 1 legs');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).routes.length, key)).toBe(1);
  await page.locator('input[type=file]').setInputFiles(path); await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).routes.length, key)).toBe(2);
  expect(errors).toEqual([]);
});

test('location editing, exact category selection, deletion and undo preserve references', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Edit Hotel', exact: true }).click();
  await page.getByLabel('Location name').fill('New Hotel'); await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.stop-name').first()).toContainText('New Hotel');
  await page.getByRole('button', { name: 'Add New Hotel to sequence' }).click();
  await page.getByRole('button', { name: 'Move stop 3 up' }).click(); await expect(page.locator('.stop-row')).toHaveCount(3);
  await expect(page.locator('.stop-name').nth(1)).toContainText('Same location');
  await page.getByRole('button', { name: 'Edit New Hotel', exact: true }).click(); await page.getByRole('button', { name: 'Delete this location' }).click();
  await expect(page.getByRole('dialog')).toContainText('2 stop(s)'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.stop-row')).toHaveCount(1); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.stop-row')).toHaveCount(3);
});

test('QR generation and image reading enter the shared import preview', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Files & transfer' }).click(); await page.getByRole('button', { name: 'Show QR', exact: true }).click();
  const image = page.getByAltText('Retro Route transfer QR code'); await expect(image).toBeVisible();
  const data = await image.getAttribute('src'); const buffer = Buffer.from(data.split(',')[1], 'base64');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Files & transfer' }).click(); await page.getByRole('button', { name: 'Scan QR / Image' }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'code.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('dialog')).toContainText('Import Route'); await expect(page.getByRole('dialog')).toContainText('Test Trip');
});

test('responsive layout exposes complete editing and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await seed(page); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Locations', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Hotel', exact: true }).click(); await page.getByLabel('Notes', { exact: true }).fill('Mobile editing\nLong notes');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Sequence', exact: true }).click(); await page.getByRole('button', { name: 'Execute', exact: true }).click();
  await page.locator('.segment-title').click(); await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByLabel('From station').fill('Tokyo'); await page.getByLabel('To station').fill('Shinjuku');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('broken storage is retained until an explicit recovery decision', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), key); await page.goto('/');
  await expect(page.getByText('Local data is unreadable. It has not been overwritten.')).toBeVisible();
  await page.getByRole('button', { name: 'New Route', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken');
});

test('invalid import does not overwrite existing routes', async ({ page }) => {
  await seed(page); await page.goto('/');
  const doc = routeFile(seeded()); doc.document.stops[0].locationId = 'missing';
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.getByRole('alert')).toContainText('missing location');
  await expect(page.locator('.route-name')).toContainText('Test Trip');
});

test('desktop preview has complete cards and retains the retro theme', async ({ page }) => {
  await seed(page); await page.goto('/'); await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.locator('.segment-title').click(); await expect(page.getByLabel('Departure')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle theme' }).click(); await expect(page.locator('.app')).toHaveClass(/dark/);
  await page.mouse.move(0, 0);
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toHaveCSS('background-color', 'rgb(26, 26, 26)');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click(); await page.getByRole('button', { name: 'Restore controls' }).click();
  await expect(page.getByRole('button', { name: 'Exit preview' })).toBeVisible();
});

test('multiple tabs detect edits made while an unsaved form is open', async ({ page, context }) => {
  await seed(page); await page.goto('/');
  const other = await context.newPage(); await other.goto('/');
  await page.getByRole('button', { name: 'Edit Hotel', exact: true }).click();
  await page.getByLabel('Location name').fill('Local draft');
  await other.getByRole('button', { name: 'Test Trip', exact: true }).click();
  await other.getByLabel('Route name').fill('Other tab'); await other.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Saving paused');
  await expect(page.getByLabel('Location name')).toHaveValue('Local draft');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Load Saved', exact: true }).click();
  await expect(page.locator('.route-name')).toContainText('Other tab');
  await expect(page.locator('.location-name').first()).toContainText('Hotel');
});

test('camera lifecycle releases media tracks on close and page hide', async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => {
    window.__cameraStopped = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 400;
      canvas.getContext('2d').fillRect(0, 0, 400, 400);
      const stream = canvas.captureStream();
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { window.__cameraStopped++; stop(); }; }
      return stream;
    };
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Files & transfer' }).click(); await page.getByRole('button', { name: 'Scan QR / Image' }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => Boolean(video.srcObject))).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__cameraStopped)).toBe(1);
  await page.getByRole('button', { name: 'Files & transfer' }).click(); await page.getByRole('button', { name: 'Scan QR / Image' }).click(); await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => Boolean(video.srcObject))).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => window.__cameraStopped)).toBe(2);
});

test('navigation is explicit, uses selected coordinates and keeps local data', async ({ page }) => {
  const r = await seed(page); await page.goto('/');
  await page.locator('.location-name').first().click();
  const popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Open in maps' }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/google\.com\/maps/);
  expect(popup.url()).toContain('destination=35.6812%2C139.7671');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).currentId, key)).toBe(r.id);
  await popup.close();
});

test('small screens keep map controls inside the map and dialogs keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Sequence', exact: true }).click();
  await page.getByRole('button', { name: 'Execute', exact: true }).click();
  const map = await page.locator('.map-region').boundingBox();
  const tools = await page.locator('.map-tools').boundingBox();
  expect(tools.y + tools.height).toBeLessThanOrEqual(map.y + map.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Route library', exact: true }).click();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate(panel => panel.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.getByRole('dialog').evaluate(panel => panel.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('picking a new map position preserves form drafts and numeric time entry works', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Edit Hotel', exact: true }).click();
  await page.getByLabel('Location name').fill('Renamed draft'); await page.getByLabel('Notes', { exact: true }).fill('Preserved notes');
  await page.getByRole('button', { name: 'Pick new position on map', exact: true }).click();
  await page.locator('.map-canvas').click({ position: { x: 300, y: 200 } });
  await expect(page.getByLabel('Location name')).toHaveValue('Renamed draft');
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Preserved notes');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Execute', exact: true }).click(); await page.locator('.segment-title').click();
  await page.getByLabel('Departure', { exact: true }).fill('2330');
  await page.getByLabel('Duration', { exact: true }).fill('2545');
  await page.getByLabel('Arrival', { exact: true }).focus();
  await expect(page.getByLabel('Departure', { exact: true })).toHaveValue('23:30');
  await expect(page.getByLabel('Duration', { exact: true })).toHaveValue('25:45');
  await expect(page.getByLabel('Arrival', { exact: true })).toHaveValue('01:15');
  await expect(page.getByLabel('Arrival day offset')).toHaveValue('2');
});

test('independent route copies and full backup restoration can be undone', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Route library', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate Test Trip', exact: true }).click();
  await page.getByRole('button', { name: 'Close route library', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Hotel', exact: true }).click(); await page.getByLabel('Location name').fill('Copy Hotel');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Route library', exact: true }).click(); await page.locator('.cartridge-name').first().click();
  await expect(page.locator('.location-name').first()).toHaveText('Hotel');
  await page.getByRole('button', { name: 'Files & transfer', exact: true }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Backup Library', exact: true }).click();
  const backup = await pending; const path = await backup.path();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Route library', exact: true }).click();
  for (const name of ['Test Trip', 'Test Trip Copy']) {
    await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Close route library', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByRole('dialog')).toContainText('Restore Library');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Your next route starts here.')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(path); await page.getByRole('button', { name: 'Restore All', exact: true }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).routes.length, key)).toBe(2);
  await expect(page.locator('.route-name')).toHaveText('Test Trip');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Your next route starts here.')).toBeVisible();
});

test('failed saves retain edited memory and allow a complete file export', async ({ page }) => {
  await seed(page);
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) { if (k === key) throw new DOMException('Quota exceeded', 'QuotaExceededError'); return original.call(this, k, value); };
  }, key);
  await page.goto('/'); await page.getByRole('button', { name: 'Edit Hotel', exact: true }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Unsaved but exportable'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Save Failed');
  await expect(page.getByRole('alert')).toContainText('Local save failed');
  await page.getByRole('button', { name: 'Files & transfer', exact: true }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Route', exact: true }).click();
  const download = await pending; const doc = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(doc.document.locations[0].notes).toBe('Unsaved but exportable');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).routes[0].locations[0].notes, key)).toBe('Arrive at 15:00');
});
