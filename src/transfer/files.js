import { LIMITS, migrateLegacy, validateRoute, validateWorkspace, stamp, uid } from '../domain/routes.js';

export const routeFile = route => ({ format: 'retro-route', version: 1, exportedAt: stamp(), document: validateRoute(route) });
export const backupFile = workspace => ({ format: 'retro-route-backup', version: 1, exportedAt: stamp(), ...validateWorkspace(workspace) });

export function parseFile(text, coordinateSystem = 'GCJ02') {
  if (new TextEncoder().encode(text).length > LIMITS.file) throw new Error('File exceeds the 10 MB limit.');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('This file is not valid JSON.'); }
  if (data?.format === 'retro-route' || data?.format === 'retro-route-backup') {
    if (data.version !== 1) throw new Error('Unsupported file version.');
    if (data.format === 'retro-route') return { kind: 'route', routes: [validateRoute(data.document)], warnings: [] };
    return { kind: 'backup', ...validateWorkspace(data), warnings: [] };
  }
  const rows = Array.isArray(data) ? data : data?.format === 'retro-route-legacy' ? data.tasks : [data];
  if (!Array.isArray(rows) || rows.length > LIMITS.routes || rows.some(r => !r || !(r.task_data || r.locationsDb || r.route))) throw new Error('Not a Retro Route document.');
  const migrated = rows.map(row => migrateLegacy(row, coordinateSystem));
  const routes = migrated.map(m => m.route);
  // Older sources can contain duplicate task identifiers. Restore each independently.
  const seen = new Set();
  for (const r of routes) { if (seen.has(r.id)) r.id = uid(); seen.add(r.id); }
  return { kind: rows.length === 1 ? 'route' : 'backup', routes, currentId: routes[0]?.id ?? null, legacy: true, warnings: [...new Set(migrated.flatMap(m => m.warnings))] };
}

export function applyImport(workspace, preview, mode) {
  if (preview.kind === 'backup') return validateWorkspace({ routes: preview.routes, currentId: preview.currentId });
  const doc = { ...validateRoute(preview.routes[0]), updatedAt: stamp() };
  if (mode === 'replace') {
    if (!workspace.routes.some(r => r.id === workspace.currentId)) throw new Error('Select a route to replace.');
    doc.id = workspace.currentId;
    return { ...workspace, routes: workspace.routes.map(r => r.id === doc.id ? doc : r) };
  }
  if (workspace.routes.length >= LIMITS.routes) throw new Error('Route library is full (200 routes).');
  doc.id = uid();
  return { routes: [...workspace.routes, doc], currentId: doc.id };
}

export function downloadJson(data, name, extension = 'retro-route.json') {
  const safeName = [...name].filter(c => c.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100) || 'route';
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${safeName}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function readRouteFile(file) {
  if (!file || file.size > LIMITS.file) throw new Error('Choose a JSON file smaller than 10 MB.');
  return file.text();
}
