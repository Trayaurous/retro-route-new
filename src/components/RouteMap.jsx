import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, Minus, Scan, RotateCcw, Navigation } from 'lucide-react';
import { IconButton } from './ui.jsx';

export default function RouteMap({ route, explore, targeting, viewRequest, onPick, onSelect, onNavigate, selectedPoint, dark }) {
  const container = useRef(null), mapRef = useRef(null), layers = useRef(null), tilesRef = useRef(null), fitted = useRef(null), consumedView = useRef(null);
  const [tileError, setTileError] = useState(false);
  const tileUrl = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  useEffect(() => {
    const map = L.map(container.current, { zoomControl: false, maxZoom: 19 }).setView([22.3, 114.16], 11);
    const tiles = L.tileLayer(tileUrl, { maxZoom: 19, attribution }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));
    layers.current = L.layerGroup().addTo(map); mapRef.current = map; tilesRef.current = tiles;
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; fitted.current = null; };
  }, [tileUrl, attribution]);

  useEffect(() => {
    const map = mapRef.current;
    const click = e => { const p = map.wrapLatLng(e.latlng); onPick({ lat: p.lat, lng: p.lng }); };
    map.on('click', click);
    return () => map.off('click', click);
  }, [onPick]);

  useEffect(() => {
    const layer = layers.current; layer.clearLayers();
    if (!route) return;
    const points = new Map(route.locations.map(p => [p.id, p]));
    const stops = route.stops.map(s => points.get(s.locationId));
    if (!explore && stops.length > 1) L.polyline(stops.map(p => [p.lat, p.lng]), { color: dark ? '#f7f4ee' : '#d95d39', weight: 4, dashArray: '9,9', interactive: false }).addTo(layer);
    for (const p of route.locations) {
      const indices = route.stops.flatMap((s, i) => s.locationId === p.id ? [i + 1] : []);
      const isStop = indices.length > 0;
      const marker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: `retro-pin ${isStop ? 'route-pin' : 'db-pin'} category-${p.category}`, html: '<span></span>', iconSize: isStop ? [18, 18] : [12, 12], iconAnchor: isStop ? [9, 9] : [6, 6] }) }).addTo(layer);
      const text = document.createElement('span'); text.textContent = `${!explore && isStop ? `[${indices.join(', ')}] ` : ''}${p.name}`;
      marker.bindTooltip(text, { permanent: isStop, direction: 'right', className: 'retro-tooltip', offset: [10, 0] });
      marker.on('click', event => { L.DomEvent.stopPropagation(event); if (targeting) onPick({ lat: p.lat, lng: p.lng }); else onSelect(p.id); });
    }
    if (fitted.current !== route.id) {
      fitted.current = route.id;
      const visible = stops.length ? stops : route.locations;
      if (visible.length) mapRef.current.fitBounds(visible.map(p => [p.lat, p.lng]), { padding: [55, 55], maxZoom: 14 });
    }
  }, [route, explore, dark, onSelect, onPick, targeting]);

  useEffect(() => {
    if (!viewRequest || !route || consumedView.current === viewRequest) return;
    consumedView.current = viewRequest;
    if (viewRequest.id) {
      const p = route.locations.find(p => p.id === viewRequest.id);
      if (p) mapRef.current.setView([p.lat, p.lng], 16);
    } else {
      const lookup = new Map(route.locations.map(p => [p.id, p]));
      const points = route.stops.length ? route.stops.map(s => lookup.get(s.locationId)) : route.locations;
      if (points.length) mapRef.current.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [55, 55], maxZoom: 14 });
    }
  }, [viewRequest, route]);

  const retry = () => { setTileError(false); tilesRef.current.redraw(); };
  return <div className={`route-map ${targeting ? 'targeting' : ''}`}>
    <div className="map-canvas" ref={container} aria-label="Route map" />
    <div className="map-tools">
      <IconButton icon={Plus} label="Zoom in" onClick={() => mapRef.current.zoomIn()} />
      <IconButton icon={Minus} label="Zoom out" onClick={() => mapRef.current.zoomOut()} />
      <IconButton icon={Scan} label="Fit route" disabled={!route?.locations.length} onClick={() => {
        const lookup = new Map(route.locations.map(p => [p.id, p]));
        const visible = route.stops.length ? route.stops.map(s => lookup.get(s.locationId)) : route.locations;
        mapRef.current.fitBounds(visible.map(p => [p.lat, p.lng]), { padding: [55, 55], maxZoom: 14 });
      }} />
      {selectedPoint && <IconButton icon={Navigation} label="Navigate to selected point" onClick={() => onNavigate(selectedPoint)} />}
    </div>
    {targeting && <div className="map-hint">Click map to {targeting === 'new' ? 'add a location' : 'move the location'}</div>}
    {tileError && <div className="map-error"><span>Map tiles unavailable</span><IconButton icon={RotateCcw} label="Retry map tiles" onClick={retry} /></div>}
    <span className="map-caption">Schematic route · WGS84</span>
  </div>;
}
