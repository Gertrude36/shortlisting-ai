import React from 'react'

/**
 * PageHero — blue hero banner for internal pages
 * Matches the homepage aesthetic (sky-blue bg, white text, subtle texture)
 *
 * Props:
 *   label    {string}  – small uppercase eyebrow label (e.g. "HR Portal")
 *   title    {string}  – main heading
 *   subtitle {string}  – short description paragraph (optional)
 *   actions  {node}    – button(s) to render in top-right corner (optional)
 *   stats    {Array}   – [{label, value, icon}] mini stat pills below title (optional)
 */
export default function PageHero({ label, title, subtitle, actions, stats }) {
  return (
    <div className="page-hero">
      <div className="container">
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
        }}>
          {/* Left content */}
          <div className="fade-up">
            {label && <div className="section-label" style={{ color: 'rgba(255,255,255,.55)', marginBottom: 10 }}>{label}</div>}
            <h1 style={{ margin: 0 }}>{title}</h1>
            <div className="hero-underline" />
            {subtitle && <p style={{ marginTop: 0 }}>{subtitle}</p>}

            {/* Optional stat pills */}
            {stats && stats.length > 0 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
                {stats.map(({ label: sLabel, value, icon }) => (
                  <div key={sLabel} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    background: 'rgba(255,255,255,.18)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255,255,255,.25)',
                    borderRadius: 8,
                  }}>
                    {icon && <span style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,.8)' }}>{icon}</span>}
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: '#fff', lineHeight: 1 }}>{value}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '.75rem', color: 'rgba(255,255,255,.7)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{sLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right actions */}
          {actions && (
            <div className="fade-up fade-up-1" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
