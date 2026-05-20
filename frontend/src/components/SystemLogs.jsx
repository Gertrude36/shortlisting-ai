import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw, Search, X, ChevronLeft, ChevronRight,
  Bot, UserPlus, Trash2, LogIn, LogOut, FileText,
  ShieldCheck, Briefcase, AlertCircle, Clock, Filter
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/axios'

/* ── helpers ── */
const PAGE_SIZE = 20

const ACTION_META = {
  login:              { icon: <LogIn size={13} />,       color: '#2563eb', bg: '#eff6ff', label: 'Login' },
  logout:             { icon: <LogOut size={13} />,      color: '#6b7280', bg: '#f3f4f6', label: 'Logout' },
  register:           { icon: <UserPlus size={13} />,    color: '#0a7c3e', bg: '#d1f5e0', label: 'Register' },
  user_created:       { icon: <UserPlus size={13} />,    color: '#0a7c3e', bg: '#d1f5e0', label: 'User Created' },
  user_deleted:       { icon: <Trash2 size={13} />,      color: '#c41a1a', bg: '#fde0e0', label: 'User Deleted' },
  job_created:        { icon: <Briefcase size={13} />,   color: '#7c3aed', bg: '#ede9fe', label: 'Job Posted' },
  job_deleted:        { icon: <Trash2 size={13} />,      color: '#c41a1a', bg: '#fde0e0', label: 'Job Deleted' },
  application_submit: { icon: <FileText size={13} />,    color: '#0369a1', bg: '#e0f2fe', label: 'Application' },
  shortlist_run:      { icon: <Bot size={13} />,         color: '#b86400', bg: '#fdf0d0', label: 'AI Shortlist' },
  doc_verified:       { icon: <ShieldCheck size={13} />, color: '#0a7c3e', bg: '#d1f5e0', label: 'Doc Verified' },
}

const DEFAULT_META = { icon: <AlertCircle size={13} />, color: '#374151', bg: '#f3f4f6', label: 'Event' }

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || { ...DEFAULT_META, label: action }
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
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/* ═══════════════════════════════════════
   SystemLogs component
═══════════════════════════════════════ */
export default function SystemLogs() {
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [page,        setPage]        = useState(1)
  const [total,       setTotal]       = useState(0)

  const fetchLogs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit',  PAGE_SIZE)
    params.set('offset', (page - 1) * PAGE_SIZE)
    if (search.trim())          params.set('search', search.trim())
    if (actionFilter !== 'all') params.set('action', actionFilter)

    api.get(`/hr/logs?${params}`)
      .then(res => {
        // accept { logs, total } or plain array
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

  // reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, actionFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allActions = Object.keys(ACTION_META)

  return (
    <div>
      {/* ── Toolbar ── */}
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
            style={{ width: 'auto', minWidth: 160, color: '#111827' }}
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            {allActions.map(a => (
              <option key={a} value={a}>{ACTION_META[a].label}</option>
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

      {/* ── Table ── */}
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
                  {['#', 'Timestamp', 'Action', 'User', 'Detail', 'IP'].map(h => (
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

                    {/* Action */}
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

                    {/* Detail */}
                    <td style={{ padding: '12px 16px', maxWidth: 300 }}>
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

      {/* ── Pagination ── */}
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
            {/* page number pills */}
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
