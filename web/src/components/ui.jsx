import { useEffect } from 'react';
import { Icon } from '../icons';

// Hlavička stránky: na mobilu oranžová lišta, na počítači nadpis v obsahu.
export function PageHead({ title, left, right, children, className = '' }) {
  return (
    <header className={`page-head ${className}`}>
      <div className="page-head-row">
        {left}
        <h1>{title}</h1>
        <div className="page-head-actions">{right}</div>
      </div>
      {children}
    </header>
  );
}

export function Sheet({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet ${wide ? 'sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zavřít"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Thumb({ src, alt = '', className = '' }) {
  return src
    ? <img src={src} alt={alt} className={`thumb ${className}`} loading="lazy" />
    : <span className={`thumb thumb-empty ${className}`}><Icon name="plate" size={22} stroke={1.4} /></span>;
}

export function Checkbox({ checked }) {
  return (
    <span className={`cb ${checked ? 'on' : ''}`} aria-hidden="true">
      {checked && <Icon name="check" size={13} stroke={3.5} />}
    </span>
  );
}
