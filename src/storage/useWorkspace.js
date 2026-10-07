import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { loadWorkspace, parseStored, saveWorkspace, STORAGE_KEY, PREFS_KEY } from './workspace.js';
import { freshWorkspace } from '../domain/routes.js';

function initial() {
  let loaded;
  try { loaded = loadWorkspace(window.localStorage); } catch (error) { loaded = { workspace: freshWorkspace(), error: error.message, revision: null }; }
  let dark = false;
  try { dark = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}').dark === true; } catch { /* Preferences must not block editing. */ }
  return { present: loaded.workspace, past: [], future: [], group: null, dirty: false, dark, loaded, revision: loaded.revision, savedAt: loaded.savedAt, status: loaded.error ? 'Save Failed' : 'Saved', conflict: null, blocked: Boolean(loaded.error), error: loaded.error || '' };
}

export function workspaceReducer(state, action) {
  const pendingStatus = state.conflict ? 'Save Paused' : state.blocked ? 'Save Failed' : 'Saving';
  if (action.type === 'edit') {
    const next = action.update(state.present);
    if (next === state.present) return state;
    const grouped = action.group && state.group?.key === action.group && action.time - state.group.time < 1000;
    return { ...state, present: next, past: grouped ? state.past : [...state.past, state.present].slice(-60), future: [], dirty: true, status: pendingStatus, group: { key: action.group, time: action.time } };
  }
  if (action.type === 'select') return { ...state, present: { ...state.present, currentId: action.id }, dirty: true, group: null, status: pendingStatus };
  if (action.type === 'undo' && state.past.length) return { ...state, present: state.past.at(-1), past: state.past.slice(0, -1), future: [state.present, ...state.future].slice(0, 60), group: null, dirty: true, status: pendingStatus };
  if (action.type === 'redo' && state.future.length) return { ...state, present: state.future[0], future: state.future.slice(1), past: [...state.past, state.present].slice(-60), group: null, dirty: true, status: pendingStatus };
  if (action.type === 'saved') return { ...state, revision: action.envelope.revision, savedAt: action.envelope.savedAt, dirty: state.present !== action.snapshot, status: state.present === action.snapshot ? 'Saved' : 'Saving', error: '' };
  if (action.type === 'failed') return { ...state, status: 'Save Failed', error: action.error };
  if (action.type === 'conflict') return { ...state, conflict: action.envelope || { ...freshWorkspace(), revision: null }, status: 'Save Paused' };
  if (action.type === 'accept') {
    const incoming = action.envelope ?? state.conflict;
    return { ...state, present: { routes: incoming.routes, currentId: incoming.currentId }, revision: incoming.revision, savedAt: incoming.savedAt, past: [], future: [], group: null, dirty: false, conflict: null, blocked: false, status: 'Saved', error: '' };
  }
  if (action.type === 'dark') return { ...state, dark: !state.dark };
  if (action.type === 'draft') return { ...state, editingDraft: action.active };
  if (action.type === 'recover') return { ...state, blocked: false, error: '', revision: null, dirty: true, status: 'Saving' };
  return state;
}

export function useWorkspace() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initial);
  const latest = useRef(null);
  useLayoutEffect(() => { latest.current = state; }, [state]);
  const save = useCallback(() => {
    const s = latest.current;
    if (!s || !s.dirty || s.blocked || s.conflict) return;
    try {
      const result = saveWorkspace(localStorage, s.present, s.revision);
      if ('conflict' in result) dispatch({ type: 'conflict', envelope: result.conflict });
      else {
        // Update the reference immediately so pagehide cannot write against a stale revision.
        latest.current = { ...s, revision: result.envelope.revision, dirty: false };
        dispatch({ type: 'saved', envelope: result.envelope, snapshot: s.present });
      }
    } catch (error) { dispatch({ type: 'failed', error: `Local save failed. Export a backup now. ${error.message}` }); }
  }, []);

  useEffect(() => {
    if (!state.dirty || state.blocked || state.conflict) return;
    const timer = setTimeout(save, 400);
    return () => clearTimeout(timer);
  }, [state.present, state.dirty, state.blocked, state.conflict, save]);

  useEffect(() => {
    const hide = () => { if (document.hidden) save(); };
    const storage = event => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        const incoming = event.newValue ? parseStored(event.newValue) : { ...freshWorkspace(), revision: null };
        if (incoming.revision === latest.current.revision) return;
        dispatch({ type: latest.current.dirty || latest.current.blocked || latest.current.editingDraft ? 'conflict' : 'accept', envelope: incoming });
      } catch { dispatch({ type: 'failed', error: 'Another tab saved unreadable data. Export this page before reloading.' }); }
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hide); window.removeEventListener('storage', storage); };
  }, [save]);

  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ dark: state.dark })); } catch { /* Route save reports storage errors separately. */ } }, [state.dark]);

  const edit = useCallback((update, group) => dispatch({ type: 'edit', update, group, time: Date.now() }), []);
  const select = useCallback(id => { save(); dispatch({ type: 'select', id }); }, [save]);
  const recover = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(`${STORAGE_KEY}.recovery.${Date.now()}`, raw);
      localStorage.removeItem(STORAGE_KEY);
      dispatch({ type: 'recover' });
    } catch (error) { dispatch({ type: 'failed', error: `Cannot preserve damaged data. Download the raw data first. ${error.message}` }); }
  }, []);
  return { state, edit, select, save, recover, dispatch };
}
