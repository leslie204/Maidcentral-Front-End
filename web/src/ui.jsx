// Small shared building blocks for every page.
import { useState } from 'react';
import Icon from './Icon.jsx';

// Plain-language names for booking frequencies (MaidCentral's names stay the data keys).
const PLAIN = { 'Every 2 weeks': 'Every other week', 'Every 3 weeks': 'Every 3 weeks', 'Every 4 weeks': 'Every 4 weeks', 'Other recurring': 'Other repeating', Unknown: 'Not set' };
export const plainFreq = (name) => PLAIN[name] || name;

// A small "?" that explains something in a sentence or two.
export function Help({ children, wide }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`help ${open ? 'open' : ''} ${wide ? 'wide' : ''}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="help-btn" aria-label="What is this?" onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))} onBlur={() => setOpen(false)}>?</button>
      {open && <span className="help-pop" role="tooltip">{children}</span>}
    </span>
  );
}

export function PageHeader({ title, subtitle, back, actions, children }) {
  return (
    <header className="page-header">
      <div className="page-title">
        {back && (
          <button className="icon-button" onClick={back} aria-label="Back">
            <Icon name="chevronLeft" />
          </button>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Stats({ items }) {
  return (
    <div className="stats-grid">
      {items.filter(Boolean).map((s, i) => (
        <div key={i} className={`stat ${s.tone || ''}`}>
          <span className="stat-label">{s.label}{s.help && <Help>{s.help}</Help>}</span>
          <span className="stat-value">{s.value ?? '–'}</span>
          {s.hint && <span className="stat-hint">{s.hint}</span>}
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label, count]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'tab active' : 'tab'} onClick={() => onChange(id)}>
          {label}
          {count ? <span className="tab-count">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={22} />
      <b>{title}</b>
      {children && <span className="muted">{children}</span>}
    </div>
  );
}

export function Skeleton({ rows = 4, height = 18 }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} style={{ height, width: `${92 - ((i * 17) % 35)}%` }} />)}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="error-note">
      <Icon name="alert" size={16} /> {error.message || String(error)}
    </div>
  );
}

// Booking frequency, in MaidCentral's own colour for it.
export function FreqPill({ frequency, compact }) {
  if (!frequency) return null;
  const label = compact ? { Weekly: 'weekly', 'Every 2 weeks': 'every other wk', 'Every 3 weeks': 'every 3 wks', 'Every 4 weeks': 'every 4 wks', 'One-time': 'one-time', 'On demand': 'on demand', 'Other recurring': 'repeating' }[frequency.short] || frequency.short : plainFreq(frequency.short);
  return (
    <span className="freq" title={`${plainFreq(frequency.short)} (MaidCentral: ${frequency.name})`} style={{ '--freq': frequency.color || '#9ca3af' }}>
      <i />
      {label}
    </span>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
