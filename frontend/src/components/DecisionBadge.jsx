import React from 'react'
import { CheckCircle, XCircle, Clock } from 'lucide-react'

/**
 * DecisionBadge
 * Colour-coded status pill with guaranteed text visibility.
 * Uses concrete hex values so text is always readable
 * regardless of CSS variable availability.
 *
 * Props
 *   decision  'shortlisted' | 'not_shortlisted' | 'pending' | string
 */
export default function DecisionBadge({ decision }) {
  const base = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           6,
    padding:       '5px 13px',
    borderRadius:  6,
    fontSize:      '.78rem',
    fontWeight:    700,
    whiteSpace:    'nowrap',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    userSelect:    'none',
    lineHeight:    1.4,
  }

  /* ── Shortlisted ─────────────────────────────────────── */
  if (decision === 'shortlisted') {
    return (
      <span style={{
        ...base,
        background: '#d1fae5',
        border:     '1.5px solid #059669',
        color:      '#064e3b',
      }}>
        <CheckCircle size={12} />
        Shortlisted
      </span>
    )
  }

  /* ── Not shortlisted ─────────────────────────────────── */
  if (decision === 'not_shortlisted') {
    return (
      <span style={{
        ...base,
        background: '#fee2e2',
        border:     '1.5px solid #dc2626',
        color:      '#7f1d1d',
      }}>
        <XCircle size={12} />
        Not Shortlisted
      </span>
    )
  }

  /* ── Pending / Under Review ──────────────────────────── */
  return (
    <span style={{
      ...base,
      background: '#fef3c7',
      border:     '1.5px solid #d97706',
      color:      '#78350f',
    }}>
      <Clock size={12} />
      Under Review
    </span>
  )
}
