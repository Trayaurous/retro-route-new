import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Disc, Plus, Trash2, Crosshair, MapPin, Edit2, Copy, X, Archive, Maximize, Minimize, Moon, Sun, Undo2, Redo2, Download, Upload, QrCode, ScanLine, Search, Navigation, ExternalLink, FileText, Play, Eye, EyeOff, Check, ChevronUp, ChevronDown, FolderOpen, Save, AlertTriangle, HelpCircle, LocateFixed } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { IconButton, Modal, Field, Empty } from './components/ui.jsx';
import { CATEGORY_ICONS } from './components/icons.js';
import SegmentCard from './components/SegmentCard.jsx';
import RouteMap from './components/RouteMap.jsx';
import { LIMITS, freshRoute, uid, stamp, pruneSegments, segmentKey, timeMinutes, CATEGORIES, validCoordinates, safeUrl } from './domain/routes.js';
import { useWorkspace } from './storage/useWorkspace.js';
import { applyImport, backupFile, downloadJson, parseFile, readRouteFile, routeFile } from './transfer/files.js';
import { decodeRoute, renderRouteQr } from './transfer/qr.js';
const Scanner = lazy(() => import('./components/Scanner.jsx'));

export default function App() {
  const { state, edit, select, save, recover, dispatch } = useWorkspace();
  const workspace = state.present, route = workspace.routes.find(r => r.id === workspace.currentId) || null;
  const [drawer, setDrawer] = useState(false), [modal, setModal] = useState(null), [error, setError] = useState('');
  const [mode, setMode] = useState('routing'), [execute, setExecute] = useState(false), [preview, setPreview] = useState(false), [hidden, setHidden] = useState(false);
  const [targeting, setTargeting] = useState(null), [selectedId, setSelectedId] = useState(null), [point, setPoint] = useState(null), [viewRequest, setViewRequest] = useState(null);
  const [targetDraft, setTargetDraft] = useState(null);
  const [query, setQuery] = useState(''), [tab, setTab] = useState('locations'), [notesOpen, setNotesOpen] = useState(false), [notesEdit, setNotesEdit] = useState(false), [full, setFull] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(Boolean(state.loaded.legacy));
  const input = useRef(null), drawerPanel = useRef(null);
  const patchRoute = useCallback((update, group) => {
    const now = stamp();
    edit(w => ({ ...w, routes: w.routes.map(r => r.id === w.currentId ? { ...pruneSegments(update(r)), updatedAt: now } : r) }), group);
  }, [edit]);
  const closeModal = useCallback(() => { setModal(null); setError(''); }, []);
  const ask = (title, text, action) => setModal({ type: 'confirm', title, text, action });
  const focusLocation = id => { setSelectedId(id); setViewRequest({ id, nonce: uid() }); };
  const changeRoute = id => { select(id); setTargeting(null); setSelectedId(null); setPoint(null); setQuery(''); setDrawer(false); };
  const create = () => {
    if (workspace.routes.length >= LIMITS.routes) { setError('Route library is full (200 routes).'); return; }
    const r = freshRoute(`Route ${workspace.routes.length + 1}`);
    edit(w => ({ routes: [...w.routes, r], currentId: r.id })); setDrawer(false); setTargeting(null); setSelectedId(null);
  };
  const exportRoute = r => { try { downloadJson(routeFile(r), r.name); } catch (e) { setError(e.message); } };
  const exportBackup = () => { try { downloadJson(backupFile(workspace), 'Retro-Route-Library', 'retro-route-backup.json'); } catch (e) { setError(e.message); } };
  const rawBackup = () => downloadJson({ format: 'retro-route-recovery', localData: state.loaded.raw || '', legacyData: state.loaded.legacy || '', exportedAt: stamp() }, 'Raw-Recovery', 'json');
  const navigate = (p, travelMode = 'car', from = null) => {
    save();
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const dest = `${p.lat},${p.lng}`; let url;
    if (apple) {
      const params = new URLSearchParams({ daddr: dest });
      if (travelMode !== 'flight') params.set('dirflg', travelMode === 'walk' ? 'w' : travelMode === 'train' ? 'r' : 'd');
      if (from) params.set('saddr', `${from.lat},${from.lng}`);
      url = `https://maps.apple.com/?${params}`;
    } else {
      const params = new URLSearchParams({ api: '1', destination: dest });
      if (travelMode !== 'flight') params.set('travelmode', travelMode === 'walk' ? 'walking' : travelMode === 'train' ? 'transit' : 'driving');
      if (from) params.set('origin', `${from.lat},${from.lng}`);
      url = `https://www.google.com/maps/dir/?${params}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const mapPick = useCallback(p => {
    if (targeting && route) {
      const existing = route.locations.find(l => l.id === targeting);
      const carried = targetDraft && (targeting === 'new' || targetDraft.id === targeting) ? targetDraft : null;
      const base = carried || existing || { id: uid(), name: '', crs: 'WGS84', category: 'stay', url: '', notes: '' };
      setModal({ type: 'location', location: { ...base, ...p }, isNew: !existing }); setTargeting(null); setTargetDraft(null);
    } else { setPoint(p); setSelectedId(null); }
  }, [targeting, route, targetDraft]);
  const selectLocation = useCallback(id => { setSelectedId(id); setPoint(null); }, []);
  const openImport = (text, crs = 'GCJ02', cached = false) => {
    try { setModal({ type: 'import', source: text, crs, cached, data: parseFile(text, crs) }); setError(''); } catch (e) { setError(e.message); }
  };
  const fileRead = async file => { try { openImport(await readRouteFile(file)); } catch (e) { setError(e.message); } };
  const showQr = async () => {
    if (!route) return; setModal({ type: 'qr', loading: true });
    try { const qr = await renderRouteQr(route); setModal(current => current?.type === 'qr' ? { type: 'qr', qr } : current); }
    catch (e) { setModal(current => current?.type === 'qr' ? { type: 'qr', failure: e.message } : current); }
  };
  const readQr = async text => {
    try { const data = await decodeRoute(text); setModal({ type: 'import', data }); setError(''); } catch (e) { setError(e.message); }
  };
  const confirmImport = how => {
    try {
      // Compute validation before dispatch: exceptions in a reducer cannot be caught here.
      const next = applyImport(workspace, modal.data, how);
      edit(() => next); if (modal.cached) setMigrationOpen(false);
      setSelectedId(null); setTargeting(null); setViewRequest({ nonce: uid() }); closeModal();
    } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    dispatch({ type: 'draft', active: modal?.type === 'location' || modal?.type === 'rename' || Boolean(targeting) });
  }, [modal?.type, targeting, dispatch]);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement;
    drawerPanel.current?.focus();
    const keyboard = e => {
      if (e.key !== 'Tab' || document.querySelector('.modal-backdrop')) return;
      const panel = drawerPanel.current;
      const controls = [...panel.querySelectorAll('button, a[href], input')].filter(el => !el.disabled && el.getClientRects().length);
      if (!controls.length) { e.preventDefault(); return; }
      if (e.shiftKey && (!panel.contains(document.activeElement) || document.activeElement === panel || document.activeElement === controls[0])) { e.preventDefault(); controls.at(-1).focus(); }
      else if (!e.shiftKey && (!panel.contains(document.activeElement) || document.activeElement === panel || document.activeElement === controls.at(-1))) { e.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); if (!document.querySelector('.modal-backdrop')) previous?.focus(); };
  }, [drawer]);
  useEffect(() => {
    const fullscreen = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fullscreen); return () => document.removeEventListener('fullscreenchange', fullscreen);
  }, []);
  useEffect(() => {
    const keys = e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || modal) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); }
      if (e.key === 'Escape') { setTargeting(null); setHidden(false); setPreview(false); setDrawer(false); }
    };
    document.addEventListener('keydown', keys); return () => document.removeEventListener('keydown', keys);
  }, [dispatch, modal]);
  const selected = route?.locations.find(p => p.id === selectedId);
  const locationLookup = new Map(route?.locations.map(p => [p.id, p]) || []);
  const legs = route?.stops.slice(0, -1).map((s, i) => ({ key: segmentKey(s.id, route.stops[i + 1].id), from: locationLookup.get(s.locationId), to: locationLookup.get(route.stops[i + 1].locationId) })) || [];
  const rename = r => setModal({ type: 'rename', id: r.id, name: r.name });
  const addStop = id => {
    if (route.stops.length >= LIMITS.stops) { setError('This route has too many stops.'); return; }
    const stop = { id: uid(), locationId: id }; patchRoute(r => ({ ...r, stops: [...r.stops, stop] }));
  };
  const moveStop = (index, direction) => patchRoute(r => {
    const stops = [...r.stops]; [stops[index], stops[index + direction]] = [stops[index + direction], stops[index]]; return { ...r, stops };
  });
  const deleteLocation = p => {
    const count = route.stops.filter(s => s.locationId === p.id).length;
    ask('Delete Location', `Delete “${p.name}”${count ? ` and its ${count} stop(s)` : ''}? You can undo this action.`, () => {
      patchRoute(r => ({ ...r, locations: r.locations.filter(l => l.id !== p.id), stops: r.stops.filter(s => s.locationId !== p.id) })); setSelectedId(null);
    });
  };

  return <div className={`app ${state.dark ? 'dark' : ''} ${preview ? 'preview-mode' : ''} ${hidden ? 'controls-hidden' : ''}`}>
    <header className="app-header">
      <IconButton icon={Disc} label="Route library" active={drawer} onClick={() => setDrawer(!drawer)} />
      <div className="brand"><strong>RETRO ROUTE</strong><button className="route-name" disabled={!route} onClick={() => rename(route)} title="Rename route">{route?.name || 'No route loaded'}</button></div>
      <div className="header-actions"><span className={`save-status ${state.status !== 'Saved' ? 'unsaved' : ''}`} role="status" aria-label={state.status} title={`${state.status} · ${state.savedAt ? `Last saved ${new Date(state.savedAt).toLocaleString()}` : 'Saved only in this browser'}`}><Save size={13} /><span>{state.status}</span></span>
        <IconButton icon={Undo2} label="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })} /><IconButton icon={Redo2} label="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })} />
        <IconButton icon={FolderOpen} label="Files & transfer" onClick={() => setModal({ type: 'files' })} /><IconButton icon={state.dark ? Moon : Sun} label="Toggle theme" onClick={() => dispatch({ type: 'dark' })} />
      </div>
    </header>
    {(error || state.error || state.conflict) && <div className="notice" role="alert"><AlertTriangle size={18} /><span>{state.conflict ? 'Another tab changed the library. Saving paused. Export this page before loading the saved version.' : error || state.error}</span>
      {state.conflict ? <><IconButton icon={Download} label="Export this library" onClick={exportBackup} /><button className="text-button" onClick={() => { dispatch({ type: 'accept' }); closeModal(); setSelectedId(null); setTargeting(null); }}>Load Saved</button></> : error ? <IconButton icon={X} label="Dismiss message" onClick={() => setError('')} /> : <IconButton icon={Download} label="Export library" onClick={exportBackup} />}
    </div>}
    {state.blocked && <div className="recovery panel"><p>Local data is unreadable. It has not been overwritten.</p><div className="action-row"><button className="text-button" onClick={rawBackup}>Export Raw</button><button className="text-button" onClick={() => ask('Start Fresh', 'Preserve damaged data in a recovery key and start saving this workspace?', recover)}>Start Fresh</button></div></div>}
    {migrationOpen && <div className="notice"><Archive size={18} /><span>Old routes found in this browser. Review them before migrating.</span><button className="text-button" onClick={() => openImport(state.loaded.legacy, 'GCJ02', true)}>Review</button><IconButton icon={X} label="Keep old cache without importing" onClick={() => setMigrationOpen(false)} /></div>}
    {!route ? <main className="welcome panel"><Disc size={52} /><h1>Your next route starts here.</h1><p>Add locations, arrange stops, and carry the plan with you.</p><div className="action-row"><button className="primary" onClick={create}><Plus size={18} />New Route</button><IconButton icon={Upload} label="Import route" onClick={() => input.current.click()} /><IconButton icon={ScanLine} label="Scan route QR" onClick={() => setModal({ type: 'scan' })} /></div><p className="muted">Local drafts stay in this browser. Export files to keep a backup.</p></main> : <main className="workspace">
      {!preview && <aside className="sidebar">
        <nav className="mobile-tabs"><button className={tab === 'locations' ? 'active' : ''} onClick={() => setTab('locations')}>Locations</button><button className={tab === 'stops' ? 'active' : ''} onClick={() => setTab('stops')}>Sequence</button></nav>
        <section className={`panel location-panel ${tab !== 'locations' ? 'mobile-inactive' : ''}`}>
          <header className="panel-heading"><h2>[ 01_LOCATION_DB ]</h2><IconButton icon={targeting ? X : Crosshair} label={targeting ? 'Cancel targeting' : 'Add location on map'} active={Boolean(targeting)} onClick={() => { setTargetDraft(null); setTargeting(targeting ? null : 'new'); }} /></header>
          <div className="search-box"><Search size={15} /><input aria-label="Filter saved locations" placeholder="Filter locations..." value={query} onChange={e => setQuery(e.target.value)} />{query && <IconButton icon={X} label="Clear filter" onClick={() => setQuery('')} />}</div>
          <div className="panel-scroll location-list">{!route.locations.length ? <Empty>Use the crosshair, then click the map. Or enter coordinates.<button className="text-button" onClick={() => setModal({ type: 'location', isNew: true, location: { id: uid(), name: '', lat: 22.3, lng: 114.16, crs: 'WGS84', category: 'stay', url: '', notes: '' } })}><Plus size={16} />Add Location</button></Empty> : !route.locations.some(p => p.name.toLowerCase().includes(query.toLowerCase())) ? <Empty>No matching locations.</Empty> : route.locations.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => {
            const Icon = CATEGORY_ICONS[p.category]; return <div key={p.id} className={`location-row ${selectedId === p.id ? 'selected' : ''}`}><button className="location-name" onClick={() => focusLocation(p.id)}><Icon size={16} /><span>{p.name}</span></button><IconButton icon={Plus} label={`Add ${p.name} to sequence`} onClick={() => addStop(p.id)} /><IconButton icon={Edit2} label={`Edit ${p.name}`} onClick={() => setModal({ type: 'location', location: p })} /></div>;
          })}</div>
        </section>
        <section className={`panel sequence-panel ${tab !== 'stops' ? 'mobile-inactive' : ''}`}><header className="panel-heading"><h2>[ 02_TAPE_SEQUENCE ]</h2><span className="count">{route.stops.length}</span></header><div className="panel-scroll sequence-list">
          {!route.stops.length ? <Empty>Add locations to the sequence with <Plus size={16} />. You can revisit a location.</Empty> : route.stops.map((s, i) => {
            const p = locationLookup.get(s.locationId); return <div key={s.id} className="stop-row"><span className="stop-number">{i + 1}</span><button className="stop-name" onClick={() => focusLocation(p.id)}>{p.name}{route.stops[i - 1]?.locationId === p.id && <small>Same location</small>}</button><div className="stop-actions"><IconButton icon={ChevronUp} label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => moveStop(i, -1)} /><IconButton icon={ChevronDown} label={`Move stop ${i + 1} down`} disabled={i === route.stops.length - 1} onClick={() => moveStop(i, 1)} /><IconButton icon={Trash2} label={`Remove stop ${i + 1}`} danger onClick={() => patchRoute(r => ({ ...r, stops: r.stops.filter(stop => stop.id !== s.id) }))} /></div></div>;
          })}
        </div><footer className="sequence-footer"><button className={`primary ${execute ? 'active' : ''}`} onClick={() => { setExecute(!execute); setTargeting(null); setSelectedId(null); setPoint(null); }}><Play size={17} />{mode === 'explore' ? 'Explore' : 'Execute'}</button><button className="text-button" onClick={() => { setPreview(true); setExecute(false); setTargeting(null); setSelectedId(null); setPoint(null); }}><Eye size={17} />Preview</button></footer></section>
      </aside>}
      <section className="stage panel">
        <header className="stage-header"><div className="mode-switch"><button className={mode === 'routing' ? 'active' : ''} onClick={() => setMode('routing')}>Routing</button><button className={mode === 'explore' ? 'active' : ''} onClick={() => setMode('explore')}>Explore</button></div><div className="action-row"><IconButton icon={FileText} label="Route notes" active={notesOpen} onClick={() => setNotesOpen(!notesOpen)} /><IconButton icon={full ? Minimize : Maximize} label="Toggle fullscreen" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else setError('Fullscreen is not supported in this browser.'); } catch { setError('Fullscreen is unavailable.'); } }} />{preview && <IconButton icon={X} label="Exit preview" onClick={() => { setPreview(false); setHidden(false); }} />}</div></header>
        <div className="map-region"><RouteMap route={route} explore={mode === 'explore'} targeting={targeting} viewRequest={viewRequest} onPick={mapPick} onSelect={selectLocation} onNavigate={navigate} selectedPoint={point} dark={state.dark} />
          {selected && <div className="place-card panel"><header><strong>{selected.name}</strong><IconButton icon={X} label="Close location details" onClick={() => setSelectedId(null)} /></header>{mode === 'explore' && <p>{selected.notes || 'No notes yet.'}</p>}<div className="action-row"><IconButton icon={LocateFixed} label="Locate on map" onClick={() => focusLocation(selected.id)} /><IconButton icon={Plus} label="Add to sequence" onClick={() => addStop(selected.id)} /><IconButton icon={Edit2} label="Edit location" onClick={() => setModal({ type: 'location', location: selected })} /><IconButton icon={Navigation} label="Open in maps" onClick={() => navigate(selected)} />{safeUrl(selected.url) && <a className="icon-button" href={safeUrl(selected.url)} target="_blank" rel="noopener noreferrer" title="Open external link" aria-label="Open external link"><ExternalLink size={18} /></a>}<IconButton icon={Trash2} label="Delete location" danger onClick={() => deleteLocation(selected)} /></div></div>}
        </div>
        {(execute || preview || notesOpen) && <div className="detail-pane">
          {(execute || preview) && <section className="itinerary"><header className="detail-heading"><h2>{mode === 'explore' ? 'Location Intel' : 'Itinerary'}</h2><span>{route.stops.length} stops · {legs.length} legs</span></header>
            {mode === 'routing' ? legs.length ? legs.map((leg, i) => {
              const value = route.segments[leg.key], previous = i ? route.segments[legs[i - 1].key] : null;
              return <SegmentCard key={`${route.id}-${leg.key}`} from={leg.from} to={leg.to} value={value} previousArrival={previous?.arrivalDay === 0 ? timeMinutes(previous.arr) : null} onNavigate={navigate} onChange={(s, field) => patchRoute(r => ({ ...r, segments: { ...r.segments, [leg.key]: s } }), `${route.id}-${leg.key}-${field}`)} />;
            }) : <Empty>No travel legs yet. Add two stops to the sequence.</Empty> : route.locations.length ? route.locations.map(p => { const Icon = CATEGORY_ICONS[p.category]; return <article className="intel-card" key={p.id}><button onClick={() => focusLocation(p.id)}><Icon size={20} /><strong>{p.name}</strong></button><p>{p.notes || 'No notes yet.'}</p><div className="action-row"><IconButton icon={Edit2} label={`Edit ${p.name}`} onClick={() => setModal({ type: 'location', location: p })} /><IconButton icon={Navigation} label={`Navigate to ${p.name}`} onClick={() => navigate(p)} />{safeUrl(p.url) && <a className="icon-button" href={safeUrl(p.url)} target="_blank" rel="noopener noreferrer" aria-label="Open external link" title="Open external link"><ExternalLink size={18} /></a>}</div></article>; }) : <Empty>No locations yet.</Empty>}
          </section>}
          {notesOpen && <section className="notes-panel"><header className="detail-heading"><h2>Captain’s Log</h2><div className="action-row"><IconButton icon={notesEdit ? Check : Edit2} label={notesEdit ? 'View Markdown' : 'Edit Markdown'} onClick={() => setNotesEdit(!notesEdit)} /><IconButton icon={X} label="Close notes" onClick={() => setNotesOpen(false)} /></div></header>{notesEdit ? <textarea aria-label="Route Markdown notes" placeholder="Write Markdown notes..." maxLength={LIMITS.text} value={route.notes} onChange={e => { const notes = e.target.value; patchRoute(r => ({ ...r, notes }), `${route.id}-notes`); }} /> : <div className="markdown-prose">{route.notes ? <ReactMarkdown urlTransform={url => safeUrl(url) || (url.startsWith('#') ? url : '')}>{route.notes}</ReactMarkdown> : <Empty>No notes recorded. Use the pencil to start.</Empty>}</div>}</section>}
        </div>}
        {preview && <footer className="preview-footer"><span>{route.name}</span><div className="action-row"><IconButton icon={FileText} label="Toggle notes" active={notesOpen} onClick={() => setNotesOpen(!notesOpen)} /><IconButton icon={EyeOff} label="Hide controls" onClick={() => setHidden(true)} /><IconButton icon={Download} label="Export route" onClick={() => exportRoute(route)} /><IconButton icon={QrCode} label="Show route QR" onClick={showQr} /></div></footer>}
      </section>
    </main>}
    {hidden && <button className="hide-controls" aria-label="Restore controls" title="Restore controls" onClick={() => setHidden(false)} />}
    {drawer && <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDrawer(false); }}><aside className="route-drawer panel" ref={drawerPanel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Route library"><header className="panel-heading"><h2>Cartridges</h2><div className="action-row"><IconButton icon={Plus} label="New route" onClick={create} /><IconButton icon={X} label="Close route library" onClick={() => setDrawer(false)} /></div></header><div className="drawer-list">{!workspace.routes.length && <Empty>No cartridges yet.</Empty>}{workspace.routes.map(r => <article className={`cartridge ${r.id === workspace.currentId ? 'selected' : ''}`} key={r.id}><button className="cartridge-name" onClick={() => changeRoute(r.id)}><Disc size={22} /><span>{r.name}<small>{r.locations.length} locations · {r.stops.length} stops</small></span></button><div className="action-row"><IconButton icon={Edit2} label={`Rename ${r.name}`} onClick={() => rename(r)} /><IconButton icon={Copy} label={`Duplicate ${r.name}`} onClick={() => { if (workspace.routes.length >= LIMITS.routes) { setError('Route library is full.'); return; } const copy = { ...structuredClone(r), id: uid(), name: `${r.name.slice(0, 190)} Copy`, createdAt: stamp(), updatedAt: stamp() }; edit(w => ({ routes: [...w.routes, copy], currentId: copy.id })); }} /><IconButton icon={Download} label={`Export ${r.name}`} onClick={() => exportRoute(r)} /><IconButton icon={Trash2} label={`Delete ${r.name}`} danger onClick={() => ask('Delete Route', `Delete “${r.name}”? You can undo this action.`, () => edit(w => { const routes = w.routes.filter(p => p.id !== r.id); return { routes, currentId: w.currentId === r.id ? routes[0]?.id ?? null : w.currentId }; }))} /></div></article>)}</div><footer className="drawer-footer"><IconButton icon={Upload} label="Import route or backup" onClick={() => input.current.click()} /><IconButton icon={Archive} label="Export full library" onClick={exportBackup} /><IconButton icon={ScanLine} label="Scan route QR" onClick={() => setModal({ type: 'scan' })} /><IconButton icon={HelpCircle} label="Help" onClick={() => setModal({ type: 'help' })} /></footer></aside></div>}
    <input hidden ref={input} type="file" accept=".json,.txt,application/json,text/plain" onChange={e => { if (e.target.files?.[0]) fileRead(e.target.files[0]); e.target.value = ''; }} />
    {modal && <Modal title={{ files: 'Files & Transfer', rename: 'Rename Route', location: modal.isNew ? 'Acquire Target' : 'Edit Location', import: modal.data?.kind === 'backup' ? 'Restore Library' : 'Import Route', qr: 'Route QR', scan: 'Scan Route', help: 'Field Manual', confirm: modal.title }[modal.type]} onClose={closeModal} wide={modal.type === 'import'}>
      {error && <p className="warning" role="alert">{error}</p>}
      {modal.type === 'files' && <div className="file-actions"><button onClick={() => { closeModal(); input.current.click(); }}><Upload />Import File</button><button disabled={!route} onClick={() => exportRoute(route)}><Download />Export Route</button><button onClick={exportBackup}><Archive />Backup Library</button><button disabled={!route} onClick={showQr}><QrCode />Show QR</button><button onClick={() => setModal({ type: 'scan' })}><ScanLine />Scan QR / Image</button><button onClick={() => setModal({ type: 'help' })}><HelpCircle />Field Manual</button><p className="muted">Importing a library backup replaces all routes after confirmation.</p></div>}
      {modal.type === 'confirm' && <><p>{modal.text}</p><div className="dialog-actions"><button className="text-button" onClick={closeModal}>Cancel</button><button className="primary" onClick={() => { modal.action(); closeModal(); }}>Confirm</button></div></>}
      {modal.type === 'rename' && <form onSubmit={e => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name').trim(); if (!name) return; const now = stamp(); edit(w => ({ ...w, routes: w.routes.map(r => r.id === modal.id ? { ...r, name, updatedAt: now } : r) })); closeModal(); }}><Field label="Route name"><input name="name" defaultValue={modal.name} maxLength={LIMITS.name} required /></Field><div className="dialog-actions"><button className="primary" type="submit"><Check size={16} />Save</button></div></form>}
      {modal.type === 'location' && <LocationForm location={modal.location} isNew={modal.isNew} onMove={draft => { setTargetDraft(draft); setTargeting(modal.isNew ? 'new' : modal.location.id); setPreview(false); closeModal(); }} onDelete={() => { const p = modal.location; closeModal(); deleteLocation(p); }} onSave={location => { if (modal.isNew && route.locations.length >= LIMITS.locations) { setError('Location limit reached.'); return; } patchRoute(r => ({ ...r, locations: modal.isNew ? [...r.locations, location] : r.locations.map(p => p.id === location.id ? location : p) })); setSelectedId(location.id); closeModal(); }} />}
      {modal.type === 'import' && <><p>{modal.data.kind === 'backup' ? `This will replace the entire library (${workspace.routes.length} existing routes).` : 'Review this route before adding or replacing it.'}</p>{modal.data.routes.map(r => <article className="import-summary" key={r.id}><strong>{r.name}</strong><p>{r.locations.length} locations · {r.stops.length} stops · {Math.max(0, r.stops.length - 1)} legs</p>{r.notes && <p className="summary-notes">{r.notes.slice(0, 350)}</p>}</article>)}
        {modal.data.legacy && <Field label="Legacy coordinate source"><select value={modal.crs} onChange={e => openImport(modal.source, e.target.value, modal.cached)}><option value="GCJ02">AMap / GCJ-02 (old desktop)</option><option value="WGS84">WGS84 / GPS</option></select></Field>}
        {modal.data.warnings.length > 0 && <details><summary>Migration notes ({modal.data.warnings.length})</summary>{modal.data.warnings.map((warning, i) => <p className="muted" key={i}>{warning}</p>)}</details>}
        {modal.data.kind === 'route' && workspace.routes.some(r => r.name === modal.data.routes[0].name) && <p className="muted">A route with this name already exists. Add creates an independent copy.</p>}
        {modal.data.kind === 'backup' && <button className="text-button" onClick={exportBackup}><Download size={16} />Backup Current Library</button>}
        {modal.data.kind === 'route' && route && <p className="muted">Replace target: {route.name} <button className="inline-button" onClick={() => exportRoute(route)}>Export first</button></p>}
        <div className="dialog-actions"><button className="text-button" onClick={closeModal}>Cancel</button>{modal.data.kind === 'route' && route && <button className="text-button" onClick={() => confirmImport('replace')}>Replace</button>}<button className="primary" onClick={() => confirmImport('add')}>{modal.data.kind === 'backup' ? 'Restore All' : 'Add'}</button></div></>}
      {modal.type === 'qr' && <div className="qr-display">{modal.loading ? <p>Encoding route…</p> : modal.failure ? <><p className="warning">{modal.failure}</p><button className="primary" onClick={() => exportRoute(route)}><Download size={17} />Export File</button></> : <><img src={modal.qr.url} alt="Retro Route transfer QR code" /><p>Scan from the Retro Route page on your other device.</p><a className="text-button" download="retro-route-qr.png" href={modal.qr.url}><Download size={17} />Save QR Image</a><p className="muted">Transfers a copy. Later edits are not synchronized.</p></>}</div>}
      {modal.type === 'scan' && <Suspense fallback={<p>Loading scanner…</p>}><Scanner onRead={readQr} onError={setError} /></Suspense>}
      {modal.type === 'help' && <div className="help"><p>1. Create a cartridge in the route library.</p><p>2. Use the crosshair to pick locations. Add each stop with the plus icon.</p><p>3. Execute opens leg details. Click a card to edit times and transport.</p><p>4. Explore holds categories, links and notes. Preview carries the plan.</p><p>5. Export files for backups, or transfer a single route by QR.</p><p>Map lines are schematic. Times and distances are entered manually.</p><p>Drafts are local to this browser. Imported routes on different devices are independent copies.</p><p>Undo / redo: Ctrl or ⌘ + Z / Shift + Z outside text fields.</p></div>}
    </Modal>}
  </div>;
}

function LocationForm({ location, isNew, onSave, onMove, onDelete }) {
  const [draft, setDraft] = useState(location), [message, setMessage] = useState('');
  const set = (key, value) => setDraft(p => ({ ...p, [key]: value }));
  return <form onSubmit={e => { e.preventDefault(); const lat = Number(draft.lat), lng = Number(draft.lng); if (String(draft.lat).trim() === '' || String(draft.lng).trim() === '' || !validCoordinates(lat, lng) || !draft.name.trim()) { setMessage('Enter a name and valid WGS84 coordinates.'); return; } onSave({ ...draft, name: draft.name.trim(), lat, lng }); }}>
    <Field label="Location name"><input value={draft.name} maxLength={LIMITS.name} required onChange={e => set('name', e.target.value)} /></Field>
    <div className="field-grid"><Field label="Latitude · WGS84"><input inputMode="decimal" value={draft.lat} onChange={e => set('lat', e.target.value)} required /></Field><Field label="Longitude · WGS84"><input inputMode="decimal" value={draft.lng} onChange={e => set('lng', e.target.value)} required /></Field></div>
    <div className="action-row"><IconButton icon={MapPin} label="Pick new position on map" onClick={() => onMove(draft)} />{!isNew && <IconButton icon={Trash2} label="Delete this location" danger onClick={onDelete} />}</div>
    <Field label="Category"><span className="category-picker">{CATEGORIES.map(category => <IconButton key={category} icon={CATEGORY_ICONS[category]} label={category[0].toUpperCase() + category.slice(1)} active={draft.category === category} onClick={() => set('category', category)} />)}</span></Field>
    <Field label="External link"><input maxLength={4000} placeholder="https://..." value={draft.url} onChange={e => set('url', e.target.value)} /></Field>{draft.url && !safeUrl(draft.url) && <p className="muted">Only complete http / https links can be opened.</p>}
    <Field label="Notes"><textarea maxLength={LIMITS.text} rows={4} value={draft.notes} onChange={e => set('notes', e.target.value)} /></Field>{message && <p className="warning">{message}</p>}
    <div className="dialog-actions"><button className="primary" type="submit"><Check size={17} />Save</button></div>
  </form>;
}
