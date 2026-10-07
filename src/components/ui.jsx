import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function IconButton({ icon, label, active = false, danger = false, className = '', ...props }) {
  const Icon = icon;
  return <button type="button" aria-label={label} title={label} className={`icon-button ${active ? 'active' : ''} ${danger ? 'danger' : ''} ${className}`} {...props}><Icon size={18} strokeWidth={2} /></button>;
}

export function Modal({ title, children, onClose, wide = false }) {
  const panel = useRef(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && (!panel.current.contains(document.activeElement) || document.activeElement === items[0] || document.activeElement === panel.current)) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && (!panel.current.contains(document.activeElement) || document.activeElement === items.at(-1) || document.activeElement === panel.current)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', keyboard);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose, title]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal panel ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={heading} ref={panel} tabIndex={-1}>
      <header className="panel-heading"><h2 id={heading}>{title}</h2><IconButton icon={X} label="Close" onClick={onClose} /></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

export function Field({ label, children }) {
  const uniqueId = useId();
  const control = isValidElement(children) && ['input', 'textarea', 'select', 'output'].includes(children.type);
  const id = control ? children.props.id || uniqueId : undefined;
  return <div className="field">{control ? <label className="field-label" htmlFor={id}>{label}</label> : <span className="field-label">{label}</span>}{control ? cloneElement(children, { id }) : children}</div>;
}
export function Empty({ children }) { return <div className="empty-state">{children}</div>; }
