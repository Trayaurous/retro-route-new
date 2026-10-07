import { freshWorkspace, validateWorkspace, uid, stamp } from '../domain/routes.js';
import { parseFile } from '../transfer/files.js';

export const STORAGE_KEY = 'retroRoute.workspace.v1';
export const PREFS_KEY = 'retroRoute.preferences.v1';
export const LEGACY_KEY = 'retroRoute_appData_tasks';

export function parseStored(raw) {
  const data = JSON.parse(raw);
  if (data.version !== 1 || typeof data.revision !== 'string') throw new Error('Unsupported local storage.');
  return { ...validateWorkspace(data), revision: data.revision, savedAt: data.savedAt };
}

export function loadWorkspace(storage) {
  let raw, legacy;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw) { const stored = parseStored(raw); return { workspace: { routes: stored.routes, currentId: stored.currentId }, revision: stored.revision, savedAt: stored.savedAt }; }
    legacy = storage.getItem(LEGACY_KEY);
    if (legacy && JSON.parse(legacy).length) return { workspace: freshWorkspace(), revision: null, legacy };
    return { workspace: freshWorkspace(), revision: null };
  } catch (error) { return { workspace: freshWorkspace(), revision: null, error: `Local data could not be read. ${error.message}`, raw, legacy }; }
}

export function migrateCached(raw, crs) { return parseFile(raw, crs); }

export function saveWorkspace(storage, workspace, expectedRevision) {
  const raw = storage.getItem(STORAGE_KEY);
  const current = raw ? parseStored(raw) : null;
  if ((current?.revision ?? null) !== expectedRevision) return { conflict: current };
  const envelope = { ...workspace, version: 1, revision: uid(), savedAt: stamp() };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return { envelope };
}
