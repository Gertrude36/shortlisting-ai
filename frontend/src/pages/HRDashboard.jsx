import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Users, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Bot, ShieldCheck, ShieldX, Trash2,
  FileText, Eye, X, ExternalLink, BarChart2
} from 'lucide-react'
import React from 'react'
import toast          from 'react-hot-toast'
import Navbar         from '../components/Navbar'
import DecisionBadge  from '../components/DecisionBadge'
import ReasonBreakdown from '../components/ReasonBreakdown'
import { useAuth }    from '../context/AuthContext'
import api            from '../api/axios'

const PASS_THRESHOLD = 0.40
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const DOC_TYPE_LABELS = { id_card: 'National ID / Passport', cv: 'CV / Resume', diploma: 'Academic Diploma', certificate: 'Professional Certificate' }
const DOC_TYPE_ICONS  = { id_card: '🪪', cv: '📄', diploma: '🎓', certificate: '📜' }
const DECISION_ORDER  = { shortlisted: 0, not_shortlisted: 1, pending: 2 }

function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const orderA = DECISION_ORDER[a.decision] ?? 2
    const orderB = DECISION_ORDER[b.decision] ?? 2
    if (orderA !== orderB) return orderA - orderB
    return (b.ai_score ?? -1) - (a.ai_score ?? -1)
  })
}

/* ── Processing overlay ── */
function ProcessingOverlay({ jobTitle }) {
  const steps = [
    { icon: '🔍', label: 'Scanning applicant data…' },
    { icon: '📄', label: 'Extracting document text via OCR…' },
    { icon: '🔗', label: 'Cross-checking form vs documents…' },
    { icon: '🎯', label: 'Matching against job requirements…' },
    { icon: '🤖', label: 'Running AI shortlisting model…' },
    { icon: '✅', label: 'Ranking and finalising decisions…' },
  ]
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 900)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,12,20,.72)', backdropFilter: 'blur(6px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{ padding: '44px 52px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2.8rem', marginBottom: 18 }}>{steps[step].icon}</div>
        <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: 8, color: '#111827' }}>
          AI Shortlisting + Document Verification
        </div>
        <div style={{ fontSize: '.9rem', color: '#6b7280', marginBottom: 24 }}>{jobTitle}</div>
        <div style={{ fontSize: '.9rem', color: '#374151', minHeight: 28 }}>{steps[step].label}</div>
        <div style={{ marginTop: 22, height: 4, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: '#2563eb',
            width: `${((step + 1) / steps.length) * 100}%`,
            transition: 'width .9s ease', borderRadius: 99,
          }} />
        </div>
      </div>
    </div>
  )
}

/* ── Delete modal ── */
function DeleteJobModal({ job, onConfirm, onCancel, isDeleting }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,12,20,.65)', backdropFilter: 'blur(5px)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: 14,
          width: '100%', maxWidth: 420,
          padding: '40px 36px',
          boxShadow: '0 28px 72px rgba(10,15,40,.20)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}
      >
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: '#fde0e0', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 22,
        }}>
          <Trash2 size={26} color="#c41a1a" />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: '0 0 12px', textAlign: 'center' }}>
          Delete this position?
        </h3>
        <p style={{ fontSize: '.9rem', color: '#6b7280', lineHeight: 1.7, margin: '0 0 10px', textAlign: 'center' }}>
          You are about to permanently delete <strong style={{ color: '#111827' }}>{job?.title}</strong>.
        </p>
        <div style={{
          padding: '10px 14px', background: '#fffbeb',
          border: '1px solid #fde68a', borderRadius: 6,
          marginBottom: 28, width: '100%',
        }}>
          <p style={{ fontSize: '.82rem', color: '#b86400', margin: 0, lineHeight: 1.6, textAlign: 'center' }}>
            ⚠ This will also permanently delete all applications and uploaded documents. This cannot be undone.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel} disabled={isDeleting}>Cancel</button>
          <button
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '10px 0', borderRadius: 4,
              background: isDeleting ? '#fca5a5' : '#c41a1a',
              border: 'none', color: '#fff',
              fontSize: '.9rem', fontWeight: 700,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Deleting…</>
              : <><Trash2 size={14} /> Delete Position</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Document viewer modal ── */
function DocumentViewerModal({ candidate, onClose }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!candidate) return
    setLoading(true)
    api.get(`/applications/${candidate.application_id}/documents`)
      .then(res => setDocs(res.data.documents || []))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false))
  }, [candidate])
  if (!candidate) return null
  const getDocUrl = url => `${API_BASE}${url}`
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,12,20,.72)', backdropFilter: 'blur(6px)',
        zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: 14,
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 28px 72px rgba(10,15,40,.20)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
          position: 'sticky', top: 0, background: '#ffffff', zIndex: 1,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
              Documents — {candidate.full_name}
            </div>
            <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 2 }}>
              {candidate.job_title} · {docs.length} of 4 uploaded
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#374151',
            }}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
            </div>
          ) : (
            <>
              {docs.map(doc => (
                <div key={doc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', background: '#f9fafb',
                  border: '1px solid #e5e7eb', borderRadius: 8,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 6,
                    background: '#deeaff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.3rem', flexShrink: 0,
                  }}>{DOC_TYPE_ICONS[doc.doc_type] || '📄'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#111827' }}>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</div>
                    <div style={{ fontSize: '.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_name}</div>
                  </div>
                  <a
                    href={getDocUrl(doc.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 4,
                      background: '#f9fafb', border: '1px solid #e5e7eb',
                      color: '#374151', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={12} /> Open
                  </a>
                </div>
              ))}
              {docs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
                  <FileText size={36} style={{ marginBottom: 12, opacity: .35 }} />
                  <div style={{ color: '#6b7280' }}>No documents uploaded yet</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Rank badge ── */
function RankBadge({ rank, decision }) {
  if (decision !== 'shortlisted') return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: '50%',
      background: rank === 1 ? '#c9a84c' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7c2e' : '#deeaff',
      color: rank <= 3 ? '#fff' : '#1a56db',
      fontSize: '.7rem', fontWeight: 700, flexShrink: 0, marginRight: 6,
    }}>
      {rank}
    </span>
  )
}

/* ── Main HR Dashboard ── */
export default function HRDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [candidates,     setCandidates]     = useState([])
  const [jobs,           setJobs]           = useState([])
  const [selectedJob,    setSelectedJob]    = useState(null)
  const [filterDecision, setFilterDecision] = useState('all')
  const [loading,        setLoading]        = useState(true)
  const [bulkLoading,    setBulkLoading]    = useState(false)
  const [bulkJobTitle,   setBulkJobTitle]   = useState('')
  const [expandedRow,    setExpandedRow]    = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [isDeleting,     setIsDeleting]     = useState(false)
  const [viewingDocsFor, setViewingDocsFor] = useState(null)

  const fetchData = () => {
    setLoading(true)
    Promise.all([api.get('/hr/candidates'), api.get('/jobs')])
      .then(([cRes, jRes]) => {
        setCandidates(cRes.data)
        const seen = new Set()
        const unique = jRes.data.filter(j => { if (seen.has(j.title)) return false; seen.add(j.title); return true })
        setJobs(unique)
        if (!selectedJob && unique.length > 0) {
          const first = unique.find(j => cRes.data.some(c => c.job_title === j.title)) || unique[0]
          setSelectedJob(first)
        }
      })
      .catch(() => toast.error('Failed to load dashboard data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleDeleteJob = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/jobs/${deleteTarget.id}`)
      toast.success(`"${deleteTarget.title}" deleted`)
      setJobs(prev => { const remaining = prev.filter(j => j.id !== deleteTarget.id); setSelectedJob(remaining.length > 0 ? remaining[0] : null); return remaining })
      setCandidates(prev => prev.filter(c => c.job_title !== deleteTarget.title))
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete position')
    } finally {
      setIsDeleting(false)
    }
  }

  const automateShortlist = async (jobId, jobTitle) => {
    setBulkJobTitle(jobTitle)
    setBulkLoading(true)
    try {
      const { data } = await api.post(`/hr/shortlist-all/${jobId}`)
      toast.success(`Processed ${data.processed} — ${data.shortlisted} shortlisted, ${data.not_shortlisted} rejected`, { duration: 6000 })
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Automated shortlisting failed')
    } finally {
      setBulkLoading(false); setBulkJobTitle('')
    }
  }

  const applicantCountByTitle = candidates.reduce((acc, c) => { acc[c.job_title] = (acc[c.job_title] || 0) + 1; return acc }, {})
  const jobCandidates    = selectedJob ? candidates.filter(c => c.job_title === selectedJob.title) : []
  const rankedCandidates = rankCandidates(jobCandidates)
  const filtered         = rankedCandidates.filter(c => filterDecision === 'all' ? true : c.decision === filterDecision)

  const total       = candidates.length
  const shortlisted = candidates.filter(c => c.decision === 'shortlisted').length
  const rejected    = candidates.filter(c => c.decision === 'not_shortlisted').length
  const unprocessed = candidates.filter(c => c.decision === 'pending').length
  const jobShortlisted = jobCandidates.filter(c => c.decision === 'shortlisted').length
  const jobRejected    = jobCandidates.filter(c => c.decision === 'not_shortlisted').length
  const jobUnprocessed = jobCandidates.filter(c => c.decision === 'pending').length

  const shortlistedRanked = rankedCandidates.filter(c => c.decision === 'shortlisted').map((c, i) => ({ id: c.application_id, rank: i + 1 }))
  const rankMap = Object.fromEntries(shortlistedRanked.map(r => [r.id, r.rank]))

  const getIdentityMatch = c => {
    if (!c.doc_verified) return false
    try { const p = JSON.parse(c.ai_reason || '{}'); return !((p.criteria_failed || []).join(' ').toLowerCase().includes('identity')) } catch { return c.doc_verified }
  }

  return (
    <>
      <Helmet><title>HR Dashboard — Shortlisting AI</title></Helmet>

      {bulkLoading && <ProcessingOverlay jobTitle={bulkJobTitle} />}
      {deleteTarget && <DeleteJobModal job={deleteTarget} onConfirm={handleDeleteJob} onCancel={() => setDeleteTarget(null)} isDeleting={isDeleting} />}
      {viewingDocsFor && <DocumentViewerModal candidate={viewingDocsFor} onClose={() => setViewingDocsFor(null)} />}

      <div className="page-wrapper">
        <Navbar />
        <div className="container" style={{ padding: '48px 28px 80px' }}>

          {/* ── Header ── */}
          <div className="fade-up" style={{ marginBottom: 36 }}>
            <div style={{
              fontSize: '.78rem', fontWeight: 700, letterSpacing: '.16em',
              textTransform: 'uppercase', color: '#2563eb', marginBottom: 8,
            }}>HR Portal</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827' }}>HR Dashboard</h1>
                <div style={{ width: 44, height: 3, background: 'linear-gradient(90deg, #2563eb, #0693c7)', marginTop: 10, borderRadius: 2 }} />
                <p style={{ color: '#6b7280', marginTop: 10, fontSize: '.95rem' }}>
                  Welcome, {user?.fullName || user?.full_name}. Manage and shortlist candidates below.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline btn-sm" onClick={fetchData}><RefreshCw size={13} /> Refresh</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/hr/jobs/new')}>+ Post Position</button>
              </div>
            </div>
          </div>

          {/* ── Global stats ── */}
          <div
            className="fade-up fade-up-1"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 16, marginBottom: 32 }}
          >
            {[
              { label: 'Total Applicants', value: total,       icon: <Users size={16} />,       color: '#111827', bg: '#f9fafb',   border: '#e5e7eb' },
              { label: 'Shortlisted',      value: shortlisted, icon: <CheckCircle size={16} />, color: '#0a7c3e', bg: '#d1f5e0',   border: 'rgba(10,124,62,.2)' },
              { label: 'Not Shortlisted',  value: rejected,    icon: <XCircle size={16} />,     color: '#c41a1a', bg: '#fde0e0',   border: 'rgba(196,26,26,.15)' },
              ...(unprocessed > 0 ? [{ label: 'Awaiting AI', value: unprocessed, icon: <Bot size={16} />, color: '#b86400', bg: '#fdf0d0', border: 'rgba(184,100,0,.18)' }] : []),
            ].map(({ label, value, icon, color, bg, border }) => (
              <div key={label} style={{
                background: bg, border: `1px solid ${border}`,
                borderRadius: 12, padding: '20px 22px',
                boxShadow: '0 2px 6px rgba(10,15,40,.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color, marginBottom: 10 }}>
                  {icon}
                  <span style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Job tabs ── */}
          {jobs.length > 0 && (
            <div
              className="fade-up fade-up-2"
              style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid #e5e7eb', marginBottom: 0 }}
            >
              {jobs.map(job => {
                const count = applicantCountByTitle[job.title] || 0
                const isActive = selectedJob?.id === job.id
                return (
                  <button
                    key={job.id}
                    onClick={() => { setSelectedJob(job); setFilterDecision('all'); setExpandedRow(null) }}
                    style={{
                      padding: '10px 18px', border: 'none',
                      borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                      background: 'none', cursor: 'pointer',
                      fontWeight: isActive ? 700 : 500, fontSize: '.9rem',
                      color: isActive ? '#2563eb' : '#374151',
                      display: 'flex', alignItems: 'center', gap: 7,
                      transition: 'all .15s', marginBottom: -2,
                    }}
                  >
                    {job.title}
                    {count > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, padding: '0 6px',
                        background: isActive ? '#2563eb' : '#e5e7eb',
                        color: isActive ? '#fff' : '#374151',
                        borderRadius: 2, fontSize: '.7rem', fontWeight: 700,
                      }}>{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Selected job panel ── */}
          {selectedJob && (
            <div
              className="card fade-up fade-up-3"
              style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '22px 26px', borderTop: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{selectedJob.title}</h2>
                  <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: '.85rem' }}>
                    <span style={{ color: '#0a7c3e', fontWeight: 600 }}>✓ {jobShortlisted} shortlisted</span>
                    <span style={{ color: '#c41a1a', fontWeight: 600 }}>✗ {jobRejected} rejected</span>
                    {jobUnprocessed > 0 && <span style={{ color: '#b86400', fontWeight: 600 }}>⚡ {jobUnprocessed} awaiting evaluation</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => navigate(`/hr/report/${selectedJob.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <BarChart2 size={13} /> View Report
                  </button>
                  <button
                    className="btn btn-accent btn-sm"
                    onClick={() => automateShortlist(selectedJob.id, selectedJob.title)}
                    disabled={bulkLoading || jobCandidates.length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                  >
                    <Bot size={14} /> Automate Shortlisting
                    {jobUnprocessed > 0 && (
                      <span style={{
                        minWidth: 18, height: 18, padding: '0 5px',
                        background: 'rgba(0,0,0,0.15)', color: '#fff',
                        borderRadius: 2, fontSize: '.68rem', fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>{jobUnprocessed}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(selectedJob)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 4,
                      background: '#fde0e0', border: '1px solid rgba(196,26,26,.2)',
                      color: '#c41a1a', fontSize: '.85rem', fontWeight: 700,
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#c41a1a'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fde0e0'; e.currentTarget.style.color = '#c41a1a' }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>

              {/* Filter */}
              <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  className="form-select"
                  style={{ width: 'auto', minWidth: 170, color: '#111827' }}
                  value={filterDecision}
                  onChange={e => { setFilterDecision(e.target.value); setExpandedRow(null) }}
                >
                  <option value="all">All Decisions</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="not_shortlisted">Not Shortlisted</option>
                </select>
                <span style={{ fontSize: '.88rem', color: '#6b7280' }}>
                  {filtered.length} of {jobCandidates.length} candidates
                </span>
                {filtered.length > 0 && filterDecision !== 'not_shortlisted' && (
                  <span style={{
                    fontSize: '.75rem', color: '#0a7c3e',
                    background: '#d1f5e0', padding: '4px 10px',
                    borderRadius: 4, border: '1px solid rgba(10,124,62,.2)',
                    letterSpacing: '.04em', fontWeight: 600,
                  }}>
                    Ranked by AI score
                  </span>
                )}
              </div>

              {/* Table */}
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                  <div className="spinner" style={{ width: 36, height: 36 }} />
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>No candidates found</h3>
                  <p style={{ fontSize: '.9rem', color: '#6b7280' }}>
                    {jobCandidates.length === 0 ? 'No applications for this position yet.' : 'Try adjusting the filter.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                        {['Rank', 'Name', 'Education', 'Experience', 'Decision', 'AI Score', 'Documents', 'Reasoning'].map(h => (
                          <th key={h} style={{
                            padding: '13px 18px', textAlign: 'left',
                            fontWeight: 700, fontSize: '.72rem',
                            color: '#374151', textTransform: 'uppercase', letterSpacing: '.08em',
                            whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => (
                        <React.Fragment key={c.application_id}>
                          <tr
                            style={{
                              borderBottom: expandedRow === c.application_id ? 'none' : '1px solid #e5e7eb',
                              background: i % 2 === 0 ? '#ffffff' : '#f9fafb',
                              transition: 'background .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#deeaff'}
                            onMouseLeave={e => e.currentTarget.style.background = expandedRow === c.application_id ? '#deeaff' : i % 2 === 0 ? '#ffffff' : '#f9fafb'}
                          >
                            <td style={{ padding: '15px 18px' }}>
                              {c.decision === 'shortlisted'
                                ? <RankBadge rank={rankMap[c.application_id]} decision={c.decision} />
                                : <span style={{ color: '#9ca3af', fontSize: '.85rem' }}>—</span>
                              }
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ fontWeight: 600, fontSize: '.95rem', color: '#111827' }}>{c.full_name}</div>
                              <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{c.email}</div>
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ fontSize: '.9rem', color: '#111827' }}>{c.education_level}</div>
                              <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{c.field_of_study}</div>
                            </td>
                            <td style={{ padding: '15px 18px', fontSize: '.9rem', color: '#374151' }}>{c.experience_years} yrs</td>
                            <td style={{ padding: '15px 18px' }}><DecisionBadge decision={c.decision} /></td>
                            <td style={{ padding: '15px 18px' }}>
                              {c.ai_score != null ? (
                                <span style={{
                                  fontWeight: 700, fontSize: '.95rem',
                                  color: c.ai_score >= PASS_THRESHOLD ? '#0a7c3e' : '#c41a1a',
                                }}>
                                  {(c.ai_score * 100).toFixed(1)}%
                                </span>
                              ) : <span style={{ color: '#9ca3af', fontSize: '.85rem' }}>—</span>}
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {c.doc_verified ? (
                                  <>
                                    <span style={{ color: '#0a7c3e', fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 4 }}><ShieldCheck size={12} /> Verified</span>
                                    {getIdentityMatch(c)
                                      ? <span style={{ color: '#0a7c3e', fontSize: '.75rem' }}>✓ Identity matched</span>
                                      : <span style={{ color: '#b86400', fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 4 }}><ShieldX size={11} /> Advisory</span>
                                    }
                                  </>
                                ) : (
                                  <span style={{ color: '#2563eb', fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 4 }}><Bot size={11} /> AI verified</span>
                                )}
                                <button
                                  onClick={() => setViewingDocsFor(c)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3,
                                    padding: '4px 8px', borderRadius: 4,
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                    color: '#2563eb', fontSize: '.72rem', fontWeight: 600,
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                  }}
                                >
                                  <Eye size={10} /> View Docs
                                </button>
                              </div>
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              {c.ai_reason ? (
                                <button
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    color: '#2563eb', fontSize: '.85rem', fontWeight: 600, padding: 0,
                                  }}
                                  onClick={() => setExpandedRow(expandedRow === c.application_id ? null : c.application_id)}
                                >
                                  {expandedRow === c.application_id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  {expandedRow === c.application_id ? 'Hide' : 'View Reason'}
                                </button>
                              ) : (
                                <span style={{ color: '#9ca3af', fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Bot size={11} color="#b86400" /> Run shortlisting
                                </span>
                              )}
                            </td>
                          </tr>

                          {expandedRow === c.application_id && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td colSpan={8} style={{ padding: '0 18px 18px', background: '#deeaff' }}>
                                <div style={{
                                  padding: '18px 22px', background: '#ffffff',
                                  borderRadius: 8, border: '1px solid #e5e7eb',
                                }}>
                                  <div style={{
                                    fontWeight: 600, fontSize: '.9rem', marginBottom: 14,
                                    display: 'flex', alignItems: 'center', gap: 8, color: '#111827',
                                  }}>
                                    <Bot size={15} color="#2563eb" />
                                    AI Decision Breakdown — {c.full_name}
                                    {c.decision === 'shortlisted' && rankMap[c.application_id] && (
                                      <span style={{ fontSize: '.8rem', color: '#6b7280', marginLeft: 4 }}>
                                        · Rank #{rankMap[c.application_id]}
                                      </span>
                                    )}
                                  </div>
                                  <ReasonBreakdown reason={c.ai_reason} candidate={c} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!loading && jobs.length === 0 && (
            <div className="card fade-up" style={{ padding: '64px 40px', textAlign: 'center', marginTop: 20 }}>
              <div style={{ fontSize: '3rem', marginBottom: 18 }}>📋</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 10, color: '#111827' }}>No positions posted yet</h3>
              <p style={{ color: '#6b7280', marginBottom: 26 }}>Create your first job posting to start receiving and shortlisting applicants.</p>
              <button className="btn btn-primary" onClick={() => navigate('/hr/jobs/new')}>+ Post First Position</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
