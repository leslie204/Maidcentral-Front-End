// Small shared building blocks for every page.
import Icon from './Icon.jsx';

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
          <span className="stat-label">{s.label}</span>
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
  const label = compact ? { Weekly: '1w', 'Every 2 weeks': '2w', 'Every 3 weeks': '3w', 'Every 4 weeks': '4w', 'One-time': '1×', 'On demand': 'OD', 'Other recurring': '↻' }[frequency.short] || frequency.short : frequency.short;
  return (
    <span className="freq" title={frequency.name} style={{ '--freq': frequency.color || '#9ca3af' }}>
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
