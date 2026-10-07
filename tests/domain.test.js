import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { gzipSync } from 'fflate';
import { freshRoute, freshSegment, uid, editTime, timeWarning, pruneSegments, segmentKey, validateRoute, migrateLegacy, normalizeTimeInput } from '../src/domain/routes.js';
import { workspaceReducer } from '../src/storage/useWorkspace.js';
import { gcjToWgs, wgsToGcj } from '../src/domain/coordinates.js';
import { applyImport, parseFile, routeFile, backupFile } from '../src/transfer/files.js';
import { encodeRoute, decodeRoute } from '../src/transfer/qr.js';
import { loadWorkspace, saveWorkspace, STORAGE_KEY } from '../src/storage/workspace.js';

function sample() {
  const r = freshRoute('香港 / Tokyo');
  r.locations = [{ id: uid(), name: 'Hotel <img src=x>', lat: 35.6812, lng: 139.7671, crs: 'WGS84', category: 'stay', notes: 'Check in\nafter 15:00', url: 'https://example.com' }, { id: uid(), name: '駅', lat: 35.68, lng: 139.77, crs: 'WGS84', category: 'food', notes: '', url: '' }];
  r.stops = [r.locations[0], r.locations[1], r.locations[0]].map(p => ({ id: uid(), locationId: p.id }));
  r.notes = '# Trip\n日本語 / 中文 / café 🚂';
  r.segments[segmentKey(r.stops[0].id, r.stops[1].id)] = { ...freshSegment(), mode: 'flight', seat: '12A', gate: 'B22', dep: '23:30', dur: '25:45', arr: '01:15', arrivalDay: 2 };
  return r;
}

test('clock calculations preserve multi-day durations and partial edits', () => {
  let s = editTime(freshSegment(), 'dep', '23:30');
  s = editTime(s, 'dur', '25:45');
  assert.equal(s.arr, '01:15'); assert.equal(s.arrivalDay, 2);
  s = editTime(s, 'arr', '02:00'); assert.equal(s.dur, '26:30');
  s = editTime(s, 'arrivalDay', 0); assert.match(timeWarning(s), /do not match/);
  const draft = editTime(s, 'dep', '2:'); assert.equal(draft.dep, '2:'); assert.equal(draft.arr, s.arr);
  const overnight = editTime({ ...freshSegment(), dep: '23:00' }, 'arr', '01:00');
  assert.equal(overnight.arrivalDay, 1); assert.equal(overnight.dur, '02:00');
  assert.equal(normalizeTimeInput('2330'), '23:30'); assert.equal(normalizeTimeInput('530'), '05:30');
  assert.equal(normalizeTimeInput('12545'), '125:45'); assert.equal(normalizeTimeInput('23:'), '23:');
});

test('history groups short text edits, restores replacement and stays bounded', () => {
  const original = { routes: [sample()], currentId: null };
  let s = { present: original, past: [], future: [], group: null, blocked: false };
  const rename = name => w => ({ ...w, routes: w.routes.map(r => ({ ...r, name })) });
  s = workspaceReducer(s, { type: 'edit', update: rename('A'), group: 'name', time: 1000 });
  s = workspaceReducer(s, { type: 'edit', update: rename('AB'), group: 'name', time: 1200 });
  assert.equal(s.past.length, 1);
  s = workspaceReducer(s, { type: 'undo' }); assert.deepEqual(s.present, original);
  s = workspaceReducer(s, { type: 'redo' }); assert.equal(s.present.routes[0].name, 'AB');
  s = workspaceReducer(s, { type: 'edit', update: () => ({ routes: [], currentId: null }), time: 3000 });
  s = workspaceReducer(s, { type: 'undo' }); assert.equal(s.present.routes.length, 1);
  for (let i = 0; i < 70; i++) s = workspaceReducer(s, { type: 'edit', update: rename(String(i)), time: 4000 + i * 2000 });
  assert.equal(s.past.length, 60);
  s = workspaceReducer({ ...s, conflict: original }, { type: 'edit', update: rename('Conflict'), time: 200000 });
  assert.equal(s.status, 'Save Paused');
});

test('reordering preserves repeated stops and only active directed legs', () => {
  const r = sample();
  const original = structuredClone(r);
  [r.stops[1], r.stops[2]] = [r.stops[2], r.stops[1]];
  const clean = pruneSegments(r);
  assert.equal(clean.stops.length, 3); assert.equal(clean.stops[0].locationId, clean.stops[1].locationId);
  assert.deepEqual(clean.segments, {}); assert.equal(Object.keys(original.segments).length, 1);
});

test('single files and full backups retain all business fields', () => {
  const r = sample();
  assert.deepEqual(parseFile(JSON.stringify(routeFile(r))).routes[0], r);
  const workspace = { routes: [r, freshRoute('Other')], currentId: r.id };
  assert.deepEqual(parseFile(JSON.stringify(backupFile(workspace))).routes, workspace.routes);
  const p = parseFile(JSON.stringify(routeFile(r)));
  const added = applyImport(workspace, p, 'add'); assert.equal(added.routes.length, 3); assert.notEqual(added.currentId, r.id);
  const replaced = applyImport(workspace, p, 'replace'); assert.equal(replaced.routes.length, 2); assert.equal(replaced.currentId, r.id);
  assert.deepEqual(replaced.routes[1], workspace.routes[1]);
});

test('damaged and future data are rejected atomically', () => {
  const r = sample();
  r.stops[0].locationId = 'missing'; assert.throws(() => validateRoute(r), /missing/);
  assert.throws(() => parseFile(JSON.stringify({ ...routeFile(sample()), version: 99 })), /version/);
  const backup = backupFile({ routes: [sample(), freshRoute()], currentId: null }); backup.routes[1].locations = 'broken';
  assert.throws(() => parseFile(JSON.stringify(backup)), /locations/);
  const duplicate = sample(); duplicate.locations.push(duplicate.locations[0]); assert.throws(() => validateRoute(duplicate), /Duplicate/);
});

test('legacy migration recovers removed points, conflicts, transport fields and warnings', () => {
  const p = { id: 'loc_a', name: 'A', lat: 38.93, lng: 121.66 };
  const old = { id: 'old', name: 'Legacy', locationsDb: [p], explorationDetails: { loc_a: { iconId: 3, notes: 'market', url: '' } }, route: [{ ...p, routeId: 'stop_a' }, { ...p, name: 'Old name', routeId: 'stop_b' }, { id: 'loc_c', name: 'Removed', lat: 38.94, lng: 121.67, routeId: 'stop_c' }], notes: 'notes', segmentDetails: { 'stop_a-stop_b': { iconId: 2, dep: '23:00', arr: '01:00', dur: '02:00', gate: 'B22', seat: '12A' }, obsolete: { iconId: 0 } } };
  const { route: migrated, warnings } = migrateLegacy(old);
  assert.equal(migrated.locations.length, 3); assert.equal(migrated.stops.length, 3);
  const s = migrated.segments[segmentKey('stop_a', 'stop_b')]; assert.equal(s.mode, 'flight'); assert.equal(s.gate, 'B22'); assert.equal(s.arrivalDay, 1); assert.equal(s.inferredDay, true);
  assert(warnings.some(w => w.includes('conflicting'))); assert(warnings.some(w => w.includes('obsolete')));
  assert.deepEqual(old.locationsDb, [p]);
});

test('coordinate conversion round trip and outside-region identity', () => {
  const p = { lat: 38.93, lng: 121.66 }; const gcj = wgsToGcj(p.lat, p.lng); const wgs = gcjToWgs(gcj.lat, gcj.lng);
  assert(Math.abs(wgs.lat - p.lat) < 1e-7); assert(Math.abs(wgs.lng - p.lng) < 1e-7);
  assert.deepEqual(gcjToWgs(35.68, 139.76), { lat: 35.68, lng: 139.76 });
});

test('QR symbol can be rasterized, decoded and imported without field loss', async () => {
  const r = sample(); const encoded = await encodeRoute(r);
  const qr = QRCode.create(encoded, { errorCorrectionLevel: 'M' });
  const moduleScale = 5, margin = 4, width = (qr.modules.size + margin * 2) * moduleScale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const mx = Math.floor(x / moduleScale) - margin, my = Math.floor(y / moduleScale) - margin;
    if (mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(my, mx)) { const at = (y * width + x) * 4; pixels[at] = pixels[at + 1] = pixels[at + 2] = 0; }
  }
  const read = jsQR(pixels, width, width); assert(read);
  assert.deepEqual((await decodeRoute(read.data)).routes[0], r);
});

test('QR rejects unknown formats and bounded decompression bombs', async () => {
  await assert.rejects(decodeRoute('https://example.com'), /supported/);
  const compressed = gzipSync(new Uint8Array(2 * 1024 * 1024));
  const bomb = `RR1:${Buffer.from(compressed).toString('base64url')}`;
  await assert.rejects(decodeRoute(bomb), /limit/);
});

test('storage handles corrupted data, concurrent revisions and quota errors', () => {
  const values = new Map(); const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const workspace = { routes: [sample()], currentId: null };
  const first = saveWorkspace(storage, workspace, null); assert(first.envelope);
  assert.equal(loadWorkspace(storage).workspace.routes.length, 1);
  const conflict = saveWorkspace(storage, { routes: [], currentId: null }, null); assert.equal(conflict.conflict.revision, first.envelope.revision);
  values.set(STORAGE_KEY, '{broken'); assert(loadWorkspace(storage).error); assert.equal(values.get(STORAGE_KEY), '{broken');
  const full = { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } };
  assert.throws(() => saveWorkspace(full, workspace, null), /Quota/);
});
