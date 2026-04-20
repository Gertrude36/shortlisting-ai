/**
 * frontend/src/pages/HRReport.jsx
 * Per-job shortlisting report page.
 * Route: /hr/report/:jobId
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  ArrowLeft, Printer, CheckCircle, XCircle,
  AlertCircle, ChevronDown, ChevronUp, Bot,
  ShieldCheck, Users, Award, TrendingUp, FileText,
} from 'lucide-react'
import toast   from 'react-hot-toast'
import Navbar  from '../components/Navbar'
import api     from '../api/axios'

const PASS_THRESHOLD = 0.40

// ── Helpers ──────────────────────────────────────────────────
function pct(n) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function ScoreBar({ score }) {
  const pctVal = Math.round((score ?? 0) * 100)
  const color  = score >= PASS_THRESHOLD ? '#0a7c3e' : '#c41a1a'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pctVal}%`,
          background: color, borderRadius: 99,
          transition: 'width .4s',
        }} />
      </div>
      <span style={{ fontSize: '.78rem', fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
        {pctVal}%
      </span>
    </div>
  )
}

function Chip({ children, color = '#1a56db', bg = '#deeaff' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99,
      background: bg, color,
      fontSize: '.72rem', fontWeight: 600,
      marginRight: 4, marginBottom: 4,
    }}>
      {children}
    </span>
  )
}

function StatCard({ icon, label, value, sub, color = '#111827', bg = '#f9fafb' }) {
  return (
    <div className="card" style={{ padding: '18px 20px', background: bg, borderColor: 'transparent', flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: '.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '.72rem', color: '#6b7280', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Criteria breakdown ────────────────────────────────────────
function CriteriaSection({ items, type }) {
  if (!items || items.length === 0) return null
  const cfg = {
    met:     { icon: '✅', color: '#166534', bg: '#f0fdf4', border: '#86efac', label: 'Criteria Met' },
    failed:  { icon: '❌', color: '#991b1b', bg: '#fef2f2', border: '#fca5a5', label: 'Reasons for Rejection' },
    warning: { icon: '⚠️', color: '#92400e', bg: '#fffbeb', border: '#fde68a', label: 'Warnings / Advisory' },
  }[type]

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      marginBottom: 10,
    }}>
      <div style={{
        fontSize: '.72rem', fontWeight: 700, color: cfg.color,
        marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em',
      }}>
        {cfg.label}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, fontSize: '.8rem', color: cfg.color,
          marginBottom: 6, lineHeight: 1.5,
        }}>
          <span style={{ flexShrink: 0, fontSize: '.9rem' }}>{cfg.icon}</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

// ── Candidate row ─────────────────────────────────────────────
function CandidateRow({ candidate, rank, expanded, onToggle }) {
  const c       = candidate
  const isShort = c.decision === 'shortlisted'
  const isPend  = c.decision === 'pending'
  const rowBg   = isShort ? '#f0fdf4' : isPend ? '#fffbeb' : '#ffffff'

  return (
    <>
      <tr style={{ background: rowBg, borderBottom: expanded ? 'none' : '1px solid #e5e7eb' }}>

        {/* Rank */}
        <td style={{ padding: '14px 16px', fontWeight: 700, fontSize: '.9rem', color: '#9ca3af', width: 52 }}>
          {isShort ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: '50%',
              background: rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7c2e' : '#deeaff',
              color: rank <= 3 ? '#fff' : '#1a56db',
              fontSize: '.75rem', fontWeight: 800,
            }}>
              {rank}
            </span>
          ) : '—'}
        </td>

        {/* Name + email */}
        <td style={{ padding: '14px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#111827' }}>{c.full_name}</div>
          <div style={{ fontSize: '.73rem', color: '#6b7280' }}>{c.email}</div>
        </td>

        {/* Qualifications */}
        <td style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '.82rem', color: '#111827' }}>{c.education_level}</div>
          <div style={{ fontSize: '.73rem', color: '#6b7280' }}>{c.field_of_study}</div>
        </td>

        {/* Experience */}
        <td style={{ padding: '14px 16px', fontSize: '.82rem', color: '#374151' }}>
          {c.experience_years} yr{c.experience_years !== 1 ? 's' : ''}
        </td>

        {/* Decision */}
        <td style={{ padding: '14px 16px' }}>
          {isShort ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99,
              background: '#dcfce7', color: '#166534',
              fontSize: '.76rem', fontWeight: 700,
            }}>
              <CheckCircle size={11} /> Shortlisted
            </span>
          ) : isPend ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99,
              background: '#fef9c3', color: '#713f12',
              fontSize: '.76rem', fontWeight: 700,
            }}>
              ⏳ Pending
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99,
              background: '#fee2e2', color: '#991b1b',
              fontSize: '.76rem', fontWeight: 700,
            }}>
              <XCircle size={11} /> Not Shortlisted
            </span>
          )}
        </td>

        {/* Score bar */}
        <td style={{ padding: '14px 16px', minWidth: 140 }}>
          {c.ai_score != null
            ? <ScoreBar score={c.ai_score} />
            : <span style={{ fontSize: '.76rem', color: '#9ca3af' }}>—</span>
          }
        </td>

        {/* Docs */}
        <td style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.76rem' }}>
            {c.doc_verified
              ? <><ShieldCheck size={12} color="#0a7c3e" /> <span style={{ color: '#0a7c3e' }}>Verified</span></>
              : <><AlertCircle size={12} color="#b86400" /> <span style={{ color: '#b86400' }}>Advisory</span></>
            }
          </div>
          <div style={{ fontSize: '.68rem', color: '#9ca3af', marginTop: 2 }}>
            {c.documents_count}/4 docs
          </div>
        </td>

        {/* Expand toggle */}
        <td style={{ padding: '14px 16px' }}>
          {c.ai_reason !== undefined ? (
            <button
              onClick={onToggle}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                color: '#2563eb', fontSize: '.76rem', fontWeight: 600, padding: 0,
              }}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'Hide' : 'View Breakdown'}
            </button>
          ) : (
            <span style={{ fontSize: '.73rem', color: '#9ca3af' }}>Not processed</span>
          )}
        </td>
      </tr>

      {/* Expanded breakdown */}
      {expanded && (
        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
          <td colSpan={8} style={{ padding: '0 16px 16px 16px', background: rowBg }}>
            <div style={{
              padding: '16px 20px', background: '#ffffff',
              borderRadius: 8, border: '1px solid #e5e7eb',
            }}>
              {/* Summary */}
              {c.summary && (
                <div style={{
                  padding: '10px 14px', background: '#f9fafb',
                  borderRadius: 8, marginBottom: 14,
                  fontSize: '.82rem', color: '#374151', lineHeight: 1.6,
                }}>
                  <span style={{ fontWeight: 700, color: '#111827' }}>
                    <Bot size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                    AI Summary:
                  </span>{' '}
                  {c.summary}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <CriteriaSection items={c.criteria_met}     type="met" />
                  <CriteriaSection items={c.criteria_warnings} type="warning" />
                </div>
                <div>
                  <CriteriaSection items={c.criteria_failed} type="failed" />
                </div>
              </div>

              {/* Declared skills */}
              {c.skills && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Declared Skills
                  </div>
                  <div>
                    {c.skills.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                      <Chip key={s}>{s}</Chip>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents submitted */}
              {c.documents?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Documents Submitted
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {c.documents.map(d => (
                      <span key={d.doc_type} style={{
                        padding: '4px 10px', borderRadius: 8,
                        background: '#f9fafb', border: '1px solid #e5e7eb',
                        fontSize: '.76rem', color: '#374151',
                      }}>
                        ✅ {d.doc_label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ML note */}
              {c.ml_note && (
                <div style={{ marginTop: 12, fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic' }}>
                  {c.ml_note}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Report Page ──────────────────────────────────────────
export default function HRReport() {
  const { jobId }  = useParams()
  const navigate   = useNavigate()

  const [report,      setReport]      = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [filter,      setFilter]      = useState('all')

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    api.get(`/hr/report/${jobId}`)
      .then(res => setReport(res.data))
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false))
  }, [jobId])

  if (loading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      </div>
    )
  }

  if (!report) return null

  const { job, summary, candidates, generated_at } = report

  const filtered = candidates.filter(c => {
    if (filter === 'all')             return true
    if (filter === 'shortlisted')     return c.decision === 'shortlisted'
    if (filter === 'not_shortlisted') return c.decision === 'not_shortlisted'
    return true
  })

  let shortlistRank = 0
  const withRank = filtered.map(c => {
    if (c.decision === 'shortlisted') shortlistRank++
    return { ...c, _rank: c.decision === 'shortlisted' ? shortlistRank : null }
  })

  const reqSkills = job.required_skills
    ? job.required_skills.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const reqCerts = job.required_certifications
    ? job.required_certifications.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const reqFields = job.required_fields
    ? job.required_fields.split(',').map(s => s.trim()).filter(Boolean)
    : []

  return (
    <>
      <Helmet><title>Shortlisting Report — {job.title} | Shortlisting AI</title></Helmet>

      <div className="page-wrapper">
        <Navbar />

        <div className="container" style={{ padding: '32px 24px 80px', maxWidth: 1100 }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12, marginBottom: 28,
          }}>
            <div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => navigate('/hr')}
                style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ArrowLeft size={13} /> Back to Dashboard
              </button>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#111827' }}>
                Shortlisting Report
              </h1>
              <div style={{ color: '#6b7280', fontSize: '.85rem', marginTop: 4 }}>
                {job.title}
                {job.location && <span> · {job.location}</span>}
                {job.employment_type && <span> · {job.employment_type}</span>}
                {job.job_level && <span> · {job.job_level}</span>}
              </div>
              <div style={{ fontSize: '.72rem', color: '#9ca3af', marginTop: 4 }}>
                Generated {new Date(generated_at).toLocaleString('en-GB')}
              </div>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Printer size={13} /> Print / Save PDF
            </button>
          </div>

          {/* ── Summary stats ── */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatCard icon={<Users size={14} />}      label="Total Applicants" value={summary.total_applicants} />
            <StatCard
              icon={<CheckCircle size={14} />} label="Shortlisted" value={summary.shortlisted}
              bg="#d1f5e0" color="#0a7c3e"
              sub={`${(summary.shortlist_rate * 100).toFixed(1)}% shortlist rate`}
            />
            <StatCard icon={<XCircle size={14} />}    label="Not Shortlisted" value={summary.not_shortlisted} bg="#fde0e0" color="#c41a1a" />
            <StatCard
              icon={<TrendingUp size={14} />} label="Average Score"
              value={summary.average_score != null ? pct(summary.average_score) : '—'}
              sub="across all candidates"
            />
            <StatCard
              icon={<Award size={14} />} label="Top Score"
              value={summary.top_score != null ? pct(summary.top_score) : '—'}
              sub="highest scoring candidate"
              bg="#deeaff" color="#1a56db"
            />
            {summary.pending > 0 && (
              <StatCard
                icon={<Bot size={14} />} label="Unprocessed" value={summary.pending}
                bg="#fdf0d0" color="#b86400"
                sub="Run 'Automate Shortlisting' in dashboard"
              />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 24, alignItems: 'start' }}>

            {/* ── Job Requirements panel ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{
                fontWeight: 700, fontSize: '.95rem',
                marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7, color: '#111827',
              }}>
                <FileText size={15} color="#2563eb" />
                Job Requirements
              </div>

              <ReqRow label="Position"          value={job.title} />
              {job.number_of_posts && <ReqRow label="Open Posts"   value={job.number_of_posts} />}
              {job.deadline        && <ReqRow label="Deadline"     value={fmtDate(job.deadline)} />}
              <ReqRow label="Education Required" value={job.required_education_levels} />
              <ReqRow label="Field of Study"     value={reqFields.join(', ') || '—'} />
              <ReqRow label="Min. Experience"    value={`${job.required_min_experience} yr(s)`} />
              <ReqRow label="Max. Experience"    value={`${job.required_max_experience} yr(s)`} />

              {reqSkills.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Required Skills
                  </div>
                  <div>{reqSkills.map(s => <Chip key={s}>{s}</Chip>)}</div>
                </div>
              )}

              {reqCerts.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Required Certifications
                  </div>
                  <div>{reqCerts.map(c => <Chip key={c} color="#b86400" bg="#fdf0d0">{c}</Chip>)}</div>
                </div>
              )}

              {job.preferred_qualifications && (
                <div style={{
                  marginTop: 8, padding: '10px 12px',
                  background: '#f9fafb', borderRadius: 8,
                  fontSize: '.78rem', color: '#374151', lineHeight: 1.6,
                }}>
                  <strong style={{ color: '#111827' }}>Preferred:</strong> {job.preferred_qualifications}
                </div>
              )}
            </div>

            {/* ── Score Distribution ── */}
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 16, color: '#111827' }}>
                Score Distribution
              </div>

              {candidates.filter(c => c.ai_score != null).length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: '.85rem', padding: '20px 0', textAlign: 'center' }}>
                  No candidates have been processed yet. Run "Automate Shortlisting" in the dashboard.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {candidates
                    .filter(c => c.ai_score != null)
                    .slice(0, 12)
                    .map(c => (
                      <div key={c.application_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          minWidth: 130, fontSize: '.78rem', fontWeight: 500, color: '#111827',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.decision === 'shortlisted' && (
                            <span style={{ color: '#0a7c3e', fontWeight: 700, marginRight: 4 }}>#{c.shortlist_rank}</span>
                          )}
                          {c.full_name}
                        </div>
                        <ScoreBar score={c.ai_score} />
                      </div>
                    ))
                  }
                  {candidates.filter(c => c.ai_score != null).length > 12 && (
                    <div style={{ fontSize: '.73rem', color: '#9ca3af', marginTop: 4 }}>
                      + {candidates.filter(c => c.ai_score != null).length - 12} more candidates — see table below
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Candidate table ── */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12, marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#111827' }}>
                All Candidates
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  className="form-select"
                  style={{ width: 'auto', color: '#111827' }}
                  value={filter}
                  onChange={e => { setFilter(e.target.value); setExpandedRow(null) }}
                >
                  <option value="all">All ({candidates.length})</option>
                  <option value="shortlisted">Shortlisted ({summary.shortlisted})</option>
                  <option value="not_shortlisted">Not Shortlisted ({summary.not_shortlisted})</option>
                </select>
                <span style={{ fontSize: '.78rem', color: '#6b7280' }}>
                  {withRank.length} shown
                </span>
              </div>
            </div>

            {withRank.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                <Users size={36} style={{ marginBottom: 12, opacity: .3 }} />
                <div>No candidates match this filter.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      {['#', 'Candidate', 'Education / Field', 'Exp.', 'Decision', 'AI Score', 'Documents', 'Breakdown'].map(h => (
                        <th key={h} style={{
                          padding: '11px 16px', textAlign: 'left',
                          fontSize: '.72rem', fontWeight: 700,
                          color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {withRank.map(c => (
                      <CandidateRow
                        key={c.application_id}
                        candidate={c}
                        rank={c._rank}
                        expanded={expandedRow === c.application_id}
                        onToggle={() => setExpandedRow(expandedRow === c.application_id ? null : c.application_id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{ marginTop: 20, fontSize: '.72rem', color: '#9ca3af', textAlign: 'center' }}>
            Shortlisting AI Report · Generated {new Date(generated_at).toLocaleString('en-GB')} ·
            Decisions are AI-assisted recommendations — final hiring decisions rest with HR.
          </div>
        </div>
      </div>
    </>
  )
}

// Small inline helper for the requirements panel rows
function ReqRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: '.82rem' }}>
      <span style={{ color: '#6b7280', minWidth: 130, flexShrink: 0 }}>{label}:</span>
      <span style={{ color: '#111827', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  )
}
