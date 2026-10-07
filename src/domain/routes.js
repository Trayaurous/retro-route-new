import { gcjToWgs } from './coordinates.js';

export const LIMITS = { routes: 200, locations: 3000, stops: 5000, text: 100000, name: 200, file: 10 * 1024 * 1024 };
export const MODES = ['car', 'train', 'flight', 'walk'];
export const CATEGORIES = ['stay', 'food', 'nature', 'shop', 'photo', 'favorite'];
export const uid = () => globalThis.crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export const segmentKey = (from, to) => `${from}~${to}`;
export const freshRoute = (name = 'Untitled Route') => ({ id: uid(), name, createdAt: stamp(), updatedAt: stamp(), locations: [], stops: [], segments: {}, notes: '' });
export const freshWorkspace = () => ({ routes: [], currentId: null });
export const freshSegment = () => ({ mode: 'car', dep: '', dur: '', arr: '', arrivalDay: 0, inferredDay: false, fromStation: '', nextStation: '', toStation: '', seat: '', gate: '', distance: '' });
export const timeMinutes = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
export const durationMinutes = value => /^\d{1,4}:[0-5]\d$/.test(value) ? Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]) : null;
// Numeric phone keyboards need not expose a colon. Normalize only on blur,
// keeping in-progress text intact during editing.
export const normalizeTimeInput = value => /^\d{3,6}$/.test(value) ? `${value.slice(0, -2).padStart(2, '0')}:${value.slice(-2)}` : value;
const clock = minutes => `${String(Math.floor(((minutes % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((minutes % 60) + 60) % 60).padStart(2, '0')}`;
const duration = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function editTime(original, field, value) {
  const s = { ...freshSegment(), ...original, [field]: value, inferredDay: false };
  const dep = timeMinutes(s.dep), dur = durationMinutes(s.dur), arr = timeMinutes(s.arr);
  if (field === 'dep' || field === 'dur') {
    if (dep !== null && dur !== null) {
      s.arr = clock(dep + dur); s.arrivalDay = Math.floor((dep + dur) / 1440);
    } else if (field === 'dep' && dep !== null && arr !== null) {
      if (s.arrivalDay === 0 && arr < dep) s.arrivalDay = 1;
      const diff = arr + s.arrivalDay * 1440 - dep;
      if (diff >= 0) s.dur = duration(diff);
    } else if (field === 'dur' && dur !== null && arr !== null) {
      // Choose the earliest nonnegative arrival day that places departure on day zero.
      s.arrivalDay = Math.max(0, Math.ceil((dur - arr) / 1440));
      s.dep = clock(arr + s.arrivalDay * 1440 - dur);
    }
  } else if (field === 'arr' || field === 'arrivalDay') {
    if (dep !== null && arr !== null) {
      if (field === 'arr' && s.arrivalDay === 0 && arr < dep) s.arrivalDay = 1;
      const diff = arr + s.arrivalDay * 1440 - dep;
      if (diff >= 0) s.dur = duration(diff);
    } else if (dur !== null && arr !== null) {
      if (field === 'arr') s.arrivalDay = Math.max(s.arrivalDay, Math.ceil((dur - arr) / 1440));
      const start = arr + s.arrivalDay * 1440 - dur;
      if (start >= 0 && start < 1440) s.dep = clock(start);
    }
  }
  return s;
}

export function timeWarning(s) {
  const dep = timeMinutes(s.dep), arr = timeMinutes(s.arr), dur = durationMinutes(s.dur);
  if ((s.dep && dep === null) || (s.arr && arr === null) || (s.dur && dur === null)) return 'Incomplete time — use HH:mm.';
  if (dep !== null && arr !== null && dur !== null && arr + s.arrivalDay * 1440 - dep !== dur) return 'Times do not match. Check the arrival day.';
  return '';
}

export function pruneSegments(route) {
  const active = new Set(route.stops.slice(0, -1).map((s, i) => segmentKey(s.id, route.stops[i + 1].id)));
  return { ...route, segments: Object.fromEntries(Object.entries(route.segments).filter(([key]) => active.has(key))) };
}

export const safeUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};

function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`); return value; }
function string(value, label, max = LIMITS.text) { if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid or oversized ${label}.`); return value; }
function id(value) { string(value, 'identifier', 100); if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid identifier.'); return value; }
function array(value, max, label) { if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid or oversized ${label}.`); return value; }
function unique(values, label) { if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}.`); }
export function validCoordinates(lat, lng) { return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }

export function validateRoute(input) {
  const r = object(input, 'route');
  const result = { id: id(r.id), name: string(r.name, 'route name', LIMITS.name), createdAt: string(r.createdAt, 'creation time', 100), updatedAt: string(r.updatedAt, 'update time', 100), notes: string(r.notes, 'notes') };
  result.locations = array(r.locations, LIMITS.locations, 'locations').map(input => {
    const p = object(input, 'location');
    if (!validCoordinates(p.lat, p.lng) || p.crs !== 'WGS84' || !CATEGORIES.includes(p.category)) throw new Error('Invalid location coordinates or category.');
    return { id: id(p.id), name: string(p.name, 'location name', LIMITS.name), lat: p.lat, lng: p.lng, crs: 'WGS84', category: p.category, url: string(p.url, 'link', 4000), notes: string(p.notes, 'location notes') };
  });
  unique(result.locations.map(p => p.id), 'locations');
  const locations = new Set(result.locations.map(p => p.id));
  result.stops = array(r.stops, LIMITS.stops, 'stops').map(p => { object(p, 'stop'); if (!locations.has(p.locationId)) throw new Error('A stop references a missing location.'); return { id: id(p.id), locationId: id(p.locationId) }; });
  unique(result.stops.map(p => p.id), 'stops');
  result.segments = {};
  const segments = object(r.segments, 'segments');
  const active = new Set(result.stops.slice(0, -1).map((s, i) => segmentKey(s.id, result.stops[i + 1].id)));
  for (const [key, input] of Object.entries(segments)) {
    if (!active.has(key)) throw new Error('A segment references nonadjacent stops.');
    const s = object(input, 'segment');
    if (!MODES.includes(s.mode) || !Number.isInteger(s.arrivalDay) || s.arrivalDay < 0 || s.arrivalDay > 500 || typeof s.inferredDay !== 'boolean') throw new Error('Invalid segment mode or arrival day.');
    const clean = { mode: s.mode, arrivalDay: s.arrivalDay, inferredDay: s.inferredDay };
    for (const field of ['dep', 'dur', 'arr', 'fromStation', 'nextStation', 'toStation', 'seat', 'gate', 'distance']) clean[field] = string(s[field] ?? '', field, 200);
    if (clean.distance && (!/^\d*(\.\d*)?$/.test(clean.distance) || (clean.distance !== '.' && !Number.isFinite(Number(clean.distance))))) throw new Error('Invalid walking distance.');
    result.segments[key] = clean;
  }
  return result;
}

export function validateWorkspace(input) {
  object(input, 'workspace');
  const routes = array(input.routes, LIMITS.routes, 'routes').map(validateRoute);
  unique(routes.map(r => r.id), 'routes');
  if (input.currentId !== null && !routes.some(r => r.id === input.currentId)) throw new Error('Current route is missing.');
  return { routes, currentId: input.currentId };
}

// Accept old SQLite rows, old tasks, and old text exports. Original sources stay untouched.
export function migrateLegacy(input, coordinateSystem = 'GCJ02') {
  const row = object(input, 'legacy route');
  let data = row.task_data ?? row;
  if (typeof data === 'string') data = JSON.parse(data);
  object(data, 'legacy route data');
  const warnings = [];
  const result = freshRoute(row.task_name || row.name || 'Imported Route');
  result.id = typeof row.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(row.id) ? row.id : uid();
  result.notes = data.notes ?? '';
  const source = array(data.locationsDb ?? [], LIMITS.locations, 'legacy locations');
  const route = array(data.route ?? [], LIMITS.stops, 'legacy stops');
  const exp = object(data.explorationDetails ?? {}, 'legacy exploration');
  const add = (p, forcedId) => {
    if (!validCoordinates(p.lat, p.lng)) throw new Error('Invalid legacy coordinates.');
    const info = exp[p.id] ?? {};
    const coords = coordinateSystem === 'GCJ02' ? gcjToWgs(p.lat, p.lng) : { lat: p.lat, lng: p.lng };
    const loc = { id: forcedId || p.id || uid(), name: p.name ?? 'Unnamed', ...coords, crs: 'WGS84', category: CATEGORIES[info.iconId ?? 0] ?? 'stay', url: info.url ?? '', notes: info.notes ?? '' };
    result.locations.push(loc); return loc;
  };
  for (const p of source) add(p);
  const oldNodes = [];
  for (const p of route) {
    let loc = result.locations.find(l => l.id === p.id);
    const expected = coordinateSystem === 'GCJ02' ? gcjToWgs(p.lat, p.lng) : p;
    if (loc && (loc.name !== p.name || Math.abs(loc.lat - expected.lat) > 1e-8 || Math.abs(loc.lng - expected.lng) > 1e-8)) {
      loc = add(p, uid()); warnings.push(`Preserved a conflicting copy of ${p.name}.`);
    } else if (!loc) { loc = add(p); warnings.push(`Recovered ${p.name} from the old sequence.`); }
    result.stops.push({ id: p.routeId || uid(), locationId: loc.id }); oldNodes.push(p.routeId);
  }
  const oldSegments = object(data.segmentDetails ?? {}, 'legacy segments');
  const used = new Set();
  for (let i = 0; i < result.stops.length - 1; i++) {
    const oldKey = `${oldNodes[i]}-${oldNodes[i + 1]}`;
    const s = oldSegments[oldKey]; if (!s) continue;
    used.add(oldKey);
    const clean = { ...freshSegment(), ...Object.fromEntries(['dep', 'dur', 'arr', 'fromStation', 'nextStation', 'toStation', 'seat', 'gate', 'distance'].map(f => [f, s[f] ?? ''])), mode: MODES[s.iconId ?? 0] ?? 'car' };
    const dep = timeMinutes(clean.dep), arr = timeMinutes(clean.arr);
    if (dep !== null && arr !== null && arr < dep) { clean.arrivalDay = 1; clean.inferredDay = true; }
    result.segments[segmentKey(result.stops[i].id, result.stops[i + 1].id)] = clean;
  }
  const orphan = Object.keys(oldSegments).filter(k => !used.has(k));
  if (orphan.length) warnings.push(`${orphan.length} obsolete segment(s) remain only in the original legacy file.`);
  if (Object.keys(exp).some(k => !source.some(p => p.id === k) && !route.some(p => p.id === k))) warnings.push('Unused legacy exploration entries remain in the original file.');
  warnings.push(coordinateSystem === 'GCJ02' ? 'Legacy AMap coordinates converted from GCJ-02 to WGS84. Verify the map positions.' : 'Legacy coordinates interpreted as WGS84.');
  return { route: validateRoute(result), warnings };
}
