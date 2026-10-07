import { ChevronDown, ChevronUp, Navigation } from 'lucide-react';
import { useState } from 'react';
import { IconButton, Field } from './ui.jsx';
import { MODE_ICONS } from './icons.js';
import { MODES, editTime, freshSegment, timeWarning, timeMinutes, normalizeTimeInput } from '../domain/routes.js';

export default function SegmentCard({ from, to, value, onChange, onNavigate, previousArrival }) {
  const [open, setOpen] = useState(false);
  const s = { ...freshSegment(), ...value }, Icon = MODE_ICONS[s.mode];
  const warning = timeWarning(s);
  const conflict = previousArrival != null && timeMinutes(s.dep) != null && previousArrival > timeMinutes(s.dep);
  const change = (field, val) => onChange(['dep', 'dur', 'arr', 'arrivalDay'].includes(field) ? editTime(s, field, val) : { ...s, [field]: val }, field);
  return <article className={`segment-card ${open ? 'expanded' : ''}`}>
    <button className="segment-title" onClick={() => setOpen(!open)} aria-expanded={open}>
      <Icon size={21} /><span>{from.name}<small>→ {to.name}</small></span><span className="segment-clock">{s.dep || '--:--'}<small>{s.arr || '--:--'} {s.arrivalDay ? `+${s.arrivalDay}d` : ''}</small></span>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
    {open && <div className="segment-body">
      <div className="action-row">{MODES.map(mode => <IconButton key={mode} icon={MODE_ICONS[mode]} label={mode === 'flight' ? 'Flight' : mode[0].toUpperCase() + mode.slice(1)} active={s.mode === mode} onClick={() => change('mode', mode)} />)}<IconButton icon={Navigation} label="Navigate this leg" onClick={() => onNavigate(to, s.mode, from)} /></div>
      <div className="time-grid">
        <Field label="Departure"><input placeholder="HH:mm" inputMode="numeric" maxLength={5} value={s.dep} onChange={e => change('dep', e.target.value.replace(/[^0-9:]/g, ''))} onBlur={() => { const next = normalizeTimeInput(s.dep); if (next !== s.dep) change('dep', next); }} /></Field>
        <Field label="Duration"><input placeholder="HH:mm" inputMode="numeric" maxLength={7} value={s.dur} onChange={e => change('dur', e.target.value.replace(/[^0-9:]/g, ''))} onBlur={() => { const next = normalizeTimeInput(s.dur); if (next !== s.dur) change('dur', next); }} /></Field>
        <Field label="Arrival"><input placeholder="HH:mm" inputMode="numeric" maxLength={5} value={s.arr} onChange={e => change('arr', e.target.value.replace(/[^0-9:]/g, ''))} onBlur={() => { const next = normalizeTimeInput(s.arr); if (next !== s.arr) change('arr', next); }} /></Field>
      </div>
      <p className="muted">Digits work too: 2330 → 23:30. Duration can exceed 24 hours.</p>
      <Field label="Arrival day offset"><input type="number" min="0" max="500" step="1" value={s.arrivalDay} onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v <= 500) change('arrivalDay', v); }} /></Field>
      {warning && <p className="warning">{warning}</p>}
      {conflict && <p className="warning">Check this departure against the previous arrival (local clocks).</p>}
      {s.inferredDay && <p className="muted">Arrival day inferred from legacy data.</p>}
      {s.mode === 'train' && <div className="field-grid">{[['fromStation', 'From station'], ['nextStation', 'Via station'], ['toStation', 'To station']].map(([key, label]) => <Field key={key} label={label}><input maxLength={200} value={s[key]} onChange={e => change(key, e.target.value)} /></Field>)}</div>}
      {s.mode === 'flight' && <div className="field-grid">{[['seat', 'Seat'], ['gate', 'Gate']].map(([key, label]) => <Field key={key} label={label}><input maxLength={200} value={s[key]} onChange={e => change(key, e.target.value)} /></Field>)}</div>}
      {s.mode === 'walk' && <div className="field-grid"><Field label="Distance (km)"><input inputMode="decimal" maxLength={30} value={s.distance} onChange={e => { if (/^\d*(\.\d*)?$/.test(e.target.value)) change('distance', e.target.value); }} /></Field><Field label="Estimated steps"><output>{Number(s.distance) > 0 ? `~${Math.round(Number(s.distance) * 1400).toLocaleString()}` : '—'}</output></Field></div>}
    </div>}
  </article>;
}
