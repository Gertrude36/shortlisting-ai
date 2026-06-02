/**
 * SystemLogs.jsx — FIXED
 *
 * Fixes:
 *  FIX-SL-1 — ACTION_META keys are now UPPERCASE to match what the
 *     backend sends (e.g. backend sends "LOGIN" not "login"). Previously
 *     no badge ever matched, so every log row showed the grey default badge.
 *
 *  FIX-SL-2 — Added all missing action types that the backend actually
 *     emits: REGISTER, APPLICATION_SUBMITTED, DOCUMENT_UPLOADED, SHORTLIST,
 *     SHORTLIST_ALL, RESHORTLIST, HR_MANUAL_REVIEW_APPROVED,
 *     HR_MANUAL_REVIEW_REJECTED, HR_MANUAL_REVIEW_REUPLOAD, USER_FEEDBACK,
 *     PROFILE_UPDATED, PASSWORD_RESET, FORGOT_PASSWORD, JOB_CREATED,
 *     JOB_DELETED, ADMIN_CREATED_USER, ADMIN_DELETED_USER,
 *     ADMIN_CHANGED_ROLE, LOGIN_FAILED, PASSWORD_CHANGED.
 *
 *  FIX-SL-3 — Filter <select> now uses the uppercase keys so it
 *     correctly filters server responses.
 *
 *  FIX-SL-4 — "HR Logs" endpoint (/hr/logs) returns only HR-relevant
 *     actions (already filtered server-side). This component is used on
 *     the HR dashboard and correctly calls /hr/logs. The Admin dashboard
 *     has its own inline LogsTab that calls /admin/logs — no change needed
 *     there.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw, Search, X, ChevronLeft, ChevronRight,
  Bot, UserPlus, Trash2, LogIn, LogOut, FileText,
  ShieldCheck, Briefcase, AlertCircle, Clock, Filter,
  MessageSquare, KeyRound, RotateCcw, UserCog, Upload,
  CheckCircle, XCircle, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/axios'

/* ── helpers ────────────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20

// FIX-SL-1 + FIX-SL-2: Keys MUST match the backend action strings exactly
// (all uppercase). Extend this map whenever new actions are added to main.py.
const ACTION_META = {
  // Auth
  LOGIN:                      { icon: <LogIn size={13} />,       color: '#2563eb', bg: '#eff6ff',  label: 'Login' },
  LOGIN_FAILED:               { icon: <XCircle size={13} />,     color: '#c41a1a', bg: '#fde0e0',  label: 'Login Failed' },
  LOGOUT:                     { icon: <LogOut size={13} />,      color: '#6b7280', bg: '#f3f4f6',  label: 'Logout' },
  REGISTER:                   { icon: <UserPlus size={13} />,    color: '#0a7c3e', bg: '#d1f5e0',  label: 'Register' },
  FORGOT_PASSWORD:            { icon: <KeyRound size={13} />,    color: '#d97706', bg: '#fef3c7',  label: 'Forgot Password' },
  PASSWORD_RESET:             { icon: <KeyRound size={13} />,    color: '#7c3aed', bg: '#ede9fe',  label: 'Password Reset' },
  PASSWORD_CHANGED:           { icon: <KeyRound size={13} />,    color: '#0369a1', bg: '#e0f2fe',  label: 'Password Changed' },
  HR_INVITE_REQUESTED:        { icon: <Send size={13} />,        color: '#0a7c3e', bg: '#d1f5e0',  label: 'HR Invite' },

  // Profile
  PROFILE_UPDATED:            { icon: <UserCog size={13} />,     color: '#0369a1', bg: '#e0f2fe',  label: 'Profile Updated' },
  PROFILE_DOCUMENT_UPLOADED:  { icon: <Upload size={13} />,      color: '#7c3aed', bg: '#ede9fe',  label: 'Profile Doc' },

  // Jobs
  JOB_CREATED:                { icon: <Briefcase size={13} />,   color: '#7c3aed', bg: '#ede9fe',  label: 'Job Created' },
  JOB_DELETED:                { icon: <Trash2 size={13} />,      color: '#c41a1a', bg: '#fde0e0',  label: 'Job Deleted' },

  // Applications
  APPLICATION_STARTED:        { icon: <FileText size={13} />,    color: '#0369a1', bg: '#e0f2fe',  label: 'App Started' },
  APPLICATION_SUBMITTED:      { icon: <FileText size={13} />,    color: '#0369a1', bg: '#e0f2fe',  label: 'App Submitted' },
  APPLICATION_DRAFT_DELETED:  { icon: <Trash2 size={13} />,      color: '#6b7280', bg: '#f3f4f6',  label: 'Draft Deleted' },

  // Documents
  DOCUMENT_UPLOADED:          { icon: <Upload size={13} />,      color: '#0a7c3e', bg: '#d1f5e0',  label: 'Doc Uploaded' },
  DOCUMENT_REJECTED:          { icon: <XCircle size={13} />,     color: '#c41a1a', bg: '#fde0e0',  label: 'Doc Rejected' },
  DOCUMENT_DELETED:           { icon: <Trash2 size={13} />,      color: '#c41a1a', bg: '#fde0e0',  label: 'Doc Deleted' },

  // Shortlisting
  SHORTLIST:                  { icon: <Bot size={13} />,         color: '#b86400', bg: '#fdf0d0',  label: 'AI Shortlist' },
  SHORTLIST_ALL:              { icon: <Bot size={13} />,         color: '#b86400', bg: '#fdf0d0',  label: 'Shortlist All' },
  SHORTLIST_ALL_STARTED:      { icon: <Bot size={13} />,         color: '#b86400', bg: '#fdf0d0',  label: 'Shortlist Started' },
  RESHORTLIST:                { icon: <RotateCcw size={13} />,   color: '#7c3aed', bg: '#ede9fe',  label: 'Re-Shortlist' },
  RESHORTLIST_ALL_STARTED:    { icon: <RotateCcw size={13} />,   color: '#7c3aed', bg: '#ede9fe',  label: 'Re-Shortlist All' },

  // Manual review
  HR_MANUAL_REVIEW_APPROVED:  { icon: <CheckCircle size={13} />, color: '#0a7c3e', bg: '#d1f5e0',  label: 'Review Approved' },
  HR_MANUAL_REVIEW_REJECTED:  { icon: <XCircle size={13} />,    color: '#c41a1a', bg: '#fde0e0',  label: 'Review Rejected' },
  HR_MANUAL_REVIEW_REUPLOAD:  { icon: <Upload size={13} />,      color: '#d97706', bg: '#fef3c7',  label: 'Reupload Req.' },

  // Feedback
  USER_FEEDBACK:              { icon: <MessageSquare size={13} />, color: '#db2777', bg: '#fce7f3', label: 'Feedback' },

  // Admin
  ADMIN_CREATED_USER:         { icon: <UserPlus size={13} />,    color: '#0a7c3e', bg: '#d1f5e0',  label: 'User Created' },
  ADMIN_DELETED_USER:         { icon: <Trash2 size={13} />,      color: '#c41a1a', bg: '#fde0e0',  label: 'User Deleted' },
  ADMIN_CHANGED_ROLE:         { icon: <ShieldCheck size={13} />, color: '#7c3aed', bg: '#ede9fe',  label: 'Role Changed' },
}

const DEFAULT_META = { icon: <AlertCircle size={13} />, color: '#374151', bg: '#f3f4f6', label: 'Event' }

function ActionBadge({ action }) {
  // FIX-SL-1: uppercase lookup — backend always sends uppercase action strings
  const meta = ACTION_META[action?.toUpperCase?.()] || { ...DEFAULT_META, label: action || 'Event' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99,
      background: meta.bg, color: meta.color,
      fontSize: '.72rem', fontWeight: 700,
      border: `1px solid ${meta.color}22`,
      whiteSpace: 'nowrap',
    }}>
      {meta.icon} {meta.label}
    </span>
  )
}

function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/* ═══════════════════════════════════════
   SystemLogs component
   Used on the HR dashboard — calls /hr/logs (server already filters to HR-relevant actions).
   The Admin dashboard has its own inline LogsTab calling /admin/logs.
═══════════════════════════════════════ */
export default function SystemLogs() {
  const [logs,         setLogs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [page,         setPage]         = useState(1)
  const [total,        setTotal]        = useState(0)

  const fetchLogs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit',  PAGE_SIZE)
    params.set('offset', (page - 1) * PAGE_SIZE)
    if (search.trim())          params.set('search', search.trim())
    // FIX-SL-3: send uppercase action to match backend filter
    if (actionFilter !== 'all') params.set('action', actionFilter.toUpperCase())

    api.get(`/hr/logs?${params}`)
      .then(res => {
        if (Array.isArray(res.data)) {
          setLogs(res.data)
          setTotal(res.data.length)
        } else {
          setLogs(res.data.logs  ?? [])
          setTotal(res.data.total ?? res.data.logs?.length ?? 0)
        }
      })
      .catch(() => toast.error('Failed to load system logs'))
      .finally(() => setLoading(false))
  }, [page, search, actionFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { setPage(1) }, [search, actionFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Only show actions that are relevant to HR (server already filters, but
  // this list controls what appears in the dropdown)
  const hrActionKeys = [
    'LOGIN', 'LOGOUT', 'REGISTER',
    'APPLICATION_STARTED', 'APPLICATION_SUBMITTED', 'APPLICATION_DRAFT_DELETED',
    'DOCUMENT_UPLOADED', 'DOCUMENT_REJECTED', 'DOCUMENT_DELETED',
    'JOB_CREATED', 'JOB_DELETED',
    'SHORTLIST', 'SHORTLIST_ALL', 'SHORTLIST_ALL_STARTED',
    'RESHORTLIST', 'RESHORTLIST_ALL_STARTED',
    'HR_MANUAL_REVIEW_APPROVED', 'HR_MANUAL_REVIEW_REJECTED', 'HR_MANUAL_REVIEW_REUPLOAD',
    'PROFILE_UPDATED', 'FORGOT_PASSWORD', 'PASSWORD_RESET', 'HR_INVITE_REQUESTED',
  ]

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
        alignItems: 'center', marginBottom: 16,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={13} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
          }} />
          <input
            className="form-input"
            style={{ paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}
            placeholder="Search by user, action, detail…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2,
              }}
            ><X size={12} /></button>
          )}
        </div>

        {/* Action filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} color="#9ca3af" />
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: 180, color: '#111827' }}
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            {hrActionKeys.map(a => (
              <option key={a} value={a}>{ACTION_META[a]?.label ?? a}</option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: '.85rem', color: '#6b7280', marginLeft: 4 }}>
          {total} {total === 1 ? 'entry' : 'entries'}
        </span>

        <button className="btn btn-outline btn-sm" onClick={fetchLogs} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #e5e7eb',
        borderRadius: 10, overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" style={{ width: 36, height: 36 }} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: 6 }}>No logs found</h3>
            <p style={{ fontSize: '.9rem', color: '#6b7280' }}>
              {search || actionFilter !== 'all' ? 'Try adjusting your filters.' : 'No system events recorded yet.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['#', 'Timestamp', 'Action', 'User', 'Role', 'Detail', 'IP'].map(h => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: 'left',
                      fontWeight: 700, fontSize: '.72rem',
                      color: '#374151', textTransform: 'uppercase', letterSpacing: '.08em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id ?? i}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      background: i % 2 === 0 ? '#ffffff' : '#f9fafb',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#ffffff' : '#f9fafb'}
                  >
                    {/* # */}
                    <td style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '.78rem', fontWeight: 600 }}>
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>

                    {/* Timestamp */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '.83rem', color: '#111827', fontWeight: 500 }}>
                        {fmt(log.timestamp ?? log.created_at)}
                      </div>
                      <div style={{
                        fontSize: '.7rem', color: '#9ca3af',
                        display: 'flex', alignItems: 'center', gap: 3, marginTop: 2,
                      }}>
                        <Clock size={10} />
                        {timeAgo(log.timestamp ?? log.created_at)}
                      </div>
                    </td>

                    {/* Action — uppercase lookup now works */}
                    <td style={{ padding: '12px 16px' }}>
                      <ActionBadge action={log.action} />
                    </td>

                    {/* User */}
                    <td style={{ padding: '12px 16px' }}>
                      {log.user_name || log.user_email ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#111827' }}>
                            {log.user_name || '—'}
                          </div>
                          {log.user_email && (
                            <div style={{ fontSize: '.73rem', color: '#6b7280' }}>{log.user_email}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '.82rem' }}>System</span>
                      )}
                    </td>

                    {/* Role */}
                    <td style={{ padding: '12px 16px' }}>
                      {log.user_role ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '2px 8px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700,
                          background: log.user_role === 'admin' ? '#ede9fe'
                            : log.user_role === 'hr' ? '#e0f2fe' : '#d1fae5',
                          color: log.user_role === 'admin' ? '#7c3aed'
                            : log.user_role === 'hr' ? '#0284c7' : '#059669',
                        }}>
                          {log.user_role === 'admin' ? 'Admin'
                            : log.user_role === 'hr' ? ' HR' : 'Applicant'}
                        </span>
                      ) : <span style={{ color: '#9ca3af', fontSize: '.78rem' }}>—</span>}
                    </td>

                    {/* Detail */}
                    <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                      <div style={{
                        fontSize: '.83rem', color: '#374151',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={log.detail ?? log.description ?? ''}>
                        {log.detail ?? log.description ?? '—'}
                      </div>
                    </td>

                    {/* IP */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '.78rem', color: '#6b7280', fontFamily: 'monospace' }}>
                        {log.ip_address ?? log.ip ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 16, flexWrap: 'wrap', gap: 10,
        }}>
          <span style={{ fontSize: '.85rem', color: '#6b7280' }}>
            Page {page} of {totalPages} · {total} total entries
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ChevronLeft size={13} /> Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const p = start + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    minWidth: 32, height: 32, borderRadius: 4,
                    border: `1px solid ${p === page ? '#2563eb' : '#e5e7eb'}`,
                    background: p === page ? '#2563eb' : '#ffffff',
                    color: p === page ? '#fff' : '#374151',
                    fontSize: '.83rem', fontWeight: p === page ? 700 : 400,
                    cursor: 'pointer',
                  }}
                >{p}</button>
              )
            })}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
