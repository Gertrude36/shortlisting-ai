import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Users, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Bot, ShieldCheck,
  Trash2, FileText, BarChart2,
  AlertCircle, Clock, Search,
  Phone, MapPin, Calendar, GraduationCap,
  Briefcase, Award, User, BookOpen, Download,
  Shield, UserCog, WifiOff, X, ExternalLink,
} from 'lucide-react'
import React from 'react'
import toast          from 'react-hot-toast'
import Navbar         from '../components/Navbar'
import DecisionBadge  from '../components/DecisionBadge'
import ReasonBreakdown from '../components/ReasonBreakdown'
import { useAuth }    from '../context/AuthContext'
import api, { getServerStatus, onServerStatusChange } from '../api/axios'

// ── STYLE TOKENS ──
const B = {
  navy: '#1e3a5f', navyMid: '#1e293b',
  blue: '#2563eb', blueDark: '#1d4ed8', blueLight: '#3b82f6', blueXLight: '#dbeafe',
  violet: '#7c3aed', violetLight: '#ede9fe',
  amber: '#d97706', amberLight: '#fef3c7',
  sky: '#0284c7', skyLight: '#e0f2fe',
  emerald: '#059669', emeraldLight: '#d1fae5',
  red: '#dc2626', redLight: '#fee2e2',
  pink: '#db2777', pinkLight: '#fce7f3',
  text: '#111827', textMid: '#374151', textLight: '#6b7280',
  border: '#e5e7eb', borderLight: '#f3f4f6',
  bg: '#f9fafb', white: '#ffffff',
}

const PASS_THRESHOLD   = 0.40
const API_BASE         = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const POLL_INTERVAL_MS = 3000
const POLL_MAX_WAIT_MS = 600000

const DOC_TYPE_LABELS = {
  id_card: 'National ID / Passport',
  cv: 'CV / Resume',
  diploma: 'Academic Diploma',
  certificate: 'Professional Certificate',
  experience: 'Experience Document',
}

// FIX: Use emoji strings instead of undefined variables
const DOC_TYPE_ICONS = {
  id_card: '',
  cv: '',
  diploma: '',
  certificate: '',
  experience: '',
}

const DECISION_ORDER = { shortlisted: 0, not_shortlisted: 1, pending: 2 }

function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const orderA = DECISION_ORDER[a.decision] ?? 2
    const orderB = DECISION_ORDER[b.decision] ?? 2
    if (orderA !== orderB) return orderA - orderB
    return (b.ai_score ?? -1) - (a.ai_score ?? -1)
  })
}

function isDeadlineExpired(deadline) {
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

async function downloadDocument(docId, originalName) {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
    const res = await fetch(`${API_BASE}/hr/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) { toast.error(`Download failed: ${res.statusText}`); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = originalName || 'document'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
    toast.success(`Downloading "${originalName}"`)
  } catch {
    toast.error('Download failed. Please try again.')
  }
}

/* ── Wake Banner ── */
function WakeServerBanner({ status, elapsedSeconds }) {
  if (status === 'awake') return null
  const dots = '.'.repeat((Math.floor(elapsedSeconds / 0.8) % 3) + 1)
  const tip  = elapsedSeconds < 10 ? 'Connecting to server…'
    : elapsedSeconds < 20 ? 'Server is waking up — Render free tier takes 15–25s…'
    : elapsedSeconds < 30 ? 'Almost there, still warming up…'
    : 'Taking longer than usual — please wait…'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderRadius: 10, marginBottom: 24, background: '#fefce8', border: `2px solid ${B.amber}` }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: B.amber, flexShrink: 0, animation: 'pulse 1.2s ease-in-out infinite' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#78350f', marginBottom: 2 }}>Server is waking up{dots}</div>
        <div style={{ fontSize: '.82rem', color: B.amber, fontWeight: 600 }}>
          {tip}&nbsp; Your dashboard will load automatically.
          {elapsedSeconds > 5 && <span style={{ marginLeft: 8, color: B.textLight, fontWeight: 500 }}>({elapsedSeconds}s elapsed)</span>}
        </div>
      </div>
      <WifiOff size={20} color={B.amber} />
    </div>
  )
}

/* ── Processing Overlay (lightened background) ── */
function ProcessingOverlay({ jobTitle, statusData }) {
  const steps = [
    { label: 'Scanning applicant data…' },
    { label: 'Extracting document text via OCR…' },
    { label: 'Cross-checking form vs documents…' },
    { label: 'Matching against job requirements…' },
    { label: 'Running AI shortlisting model…' },
    { label: 'Ranking and finalising decisions…' },
  ]
  const [step, setStep]       = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 900)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  const total = statusData?.total || 0
  const done  = statusData?.done  || 0
  const progressPct = total > 0
    ? Math.min((done / total) * 100, 100)
    : Math.min(((elapsed / 120) * 100), 95)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0, 0, 0, 0.3)',
      backdropFilter: 'blur(6px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        padding: '44px 52px', maxWidth: 460, width: '100%', textAlign: 'center',
        background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12,
        boxShadow: '0 20px 35px -12px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: '2.8rem', marginBottom: 18, transition: 'all .3s' }}>
          {steps[step].icon}
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 8, color: B.text }}>
          AI Shortlisting + Document Verification
        </div>
        <div style={{ fontSize: '.95rem', color: B.textLight, marginBottom: 6 }}>
          {jobTitle}
        </div>
        {total > 0 && (
          <div style={{ fontSize: '.9rem', color: B.textMid, marginBottom: 6, fontWeight: 700 }}>
            Processing {done} of {total} candidate{total !== 1 ? 's' : ''}…
          </div>
        )}
        <div style={{
          fontSize: '.82rem',
          color: elapsed >= 15 ? B.amber : 'transparent',
          marginBottom: 16, fontWeight: 700, transition: 'color .5s',
        }}>
          ⏱ {elapsedLabel} — OCR + AI processing takes 30–120s per applicant.
        </div>
        <div style={{ fontSize: '.95rem', color: B.textMid, minHeight: 28 }}>
          {steps[step].label}
        </div>
        <div style={{ marginTop: 22, height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: B.blue,
            width: `${progressPct}%`,
            transition: 'width .9s ease', borderRadius: 99,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: 7, height: 7, borderRadius: '50%',
              background: i === step ? B.blue : '#e5e7eb',
              transition: 'background .3s',
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Delete Job Modal (lightened background) ── */
function DeleteJobModal({ job, onConfirm, onCancel, isDeleting }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.white, borderRadius: 14, width: '100%', maxWidth: 420, padding: '40px 36px', boxShadow: '0 28px 72px rgba(10,15,40,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: B.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <Trash2 size={26} color={B.red} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, margin: '0 0 12px', textAlign: 'center' }}>Delete this position?</h3>
        <p style={{ fontSize: '.95rem', color: B.textLight, lineHeight: 1.7, margin: '0 0 10px', textAlign: 'center' }}>Permanently delete <strong style={{ color: B.text }}>{job?.title}</strong>.</p>
        <div style={{ padding: '12px 16px', background: B.amberLight, border: `2px solid ${B.amber}`, borderRadius: 8, marginBottom: 28, width: '100%' }}>
          <p style={{ fontSize: '.85rem', color: B.amber, margin: 0, lineHeight: 1.6, textAlign: 'center', fontWeight: 600 }}>All applications and uploaded documents will also be permanently deleted. This cannot be undone.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={onCancel} disabled={isDeleting} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={isDeleting} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 8, background: isDeleting ? B.redLight : B.red, border: 'none', color: B.white, fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }}>
            {isDeleting ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Deleting…</> : <><Trash2 size={14} /> Delete Position</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ── CandidateProfileModal – fixed text visibility ──
   ══════════════════════════════════════════════════════════════ */
function CandidateProfileModal({ candidate, onClose }) {
  const [docs, setDocs]                   = useState([])
  const [loadingDocs, setLoadingDocs]     = useState(true)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    if (!candidate) return
    setLoadingDocs(true)
    api.get(`/applications/${candidate.application_id}/documents`)
      .then(res => setDocs(res.data.documents || []))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoadingDocs(false))
  }, [candidate])

  if (!candidate) return null

  const handleDownload = async (doc) => {
    setDownloadingId(doc.id)
    await downloadDocument(doc.id, doc.original_name || doc.doc_type)
    setDownloadingId(null)
  }

  const InfoRow = ({ icon, label, value }) => {
    if (!value) return null
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: `1px solid ${B.borderLight}` }}>
        <div style={{ color: B.textMid, flexShrink: 0, marginTop: 1 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.7rem', fontWeight: 800, color: B.textLight, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: '.9rem', color: B.text, fontWeight: 600, lineHeight: 1.5 }}>{value}</div>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(6px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.white, borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 28px 72px rgba(10,15,40,.28)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${B.navy} 0%, ${B.blue} 100%)`, padding: '28px 28px 24px', borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {candidate.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>{candidate.full_name}</div>
                <div style={{ fontSize: '.88rem', color: '#bfdbfe', marginTop: 2 }}>{candidate.email}</div>
                <div style={{ fontSize: '.8rem', color: '#93c5fd', marginTop: 4 }}>Applying for: <strong style={{ color: '#fff' }}>{candidate.job_title}</strong></div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Decision pill */}
          <div style={{ padding: '16px 20px', borderRadius: 10, background: candidate.decision === 'shortlisted' ? B.emeraldLight : candidate.decision === 'not_shortlisted' ? B.redLight : B.amberLight, border: `2px solid ${candidate.decision === 'shortlisted' ? B.emerald : candidate.decision === 'not_shortlisted' ? B.red : B.amber}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '1.6rem' }}>{candidate.decision === 'shortlisted' ? '✅' : candidate.decision === 'not_shortlisted' ? '❌' : '⏳'}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.95rem', color: candidate.decision === 'shortlisted' ? '#14532d' : candidate.decision === 'not_shortlisted' ? '#7f1d1d' : '#78350f' }}>
                {candidate.decision === 'shortlisted' ? 'Shortlisted' : candidate.decision === 'not_shortlisted' ? 'Not Shortlisted' : 'Pending Evaluation'}
              </div>
              {candidate.ai_score != null && (
                <div style={{ fontSize: '.85rem', color: B.textLight, marginTop: 2, fontWeight: 600 }}>
                  AI Score: <strong style={{ color: candidate.ai_score >= PASS_THRESHOLD ? B.emerald : B.red }}>{(candidate.ai_score * 100).toFixed(1)}%</strong>
                </div>
              )}
            </div>
          </div>

          {/* Personal Information & Education */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: B.bg, borderRadius: 10, padding: '18px 20px', border: `1.5px solid ${B.borderLight}` }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: B.textMid, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={13} color={B.textLight} /> Personal Information
              </div>
              <InfoRow icon={<Phone size={14} />}    label="Email"         value={candidate.email} />
              <InfoRow icon={<Phone size={14} />}    label="Phone"         value={candidate.phone} />
              <InfoRow icon={<MapPin size={14} />}   label="Address"       value={candidate.address} />
              <InfoRow icon={<Calendar size={14} />} label="Date of Birth" value={candidate.date_of_birth} />
              <InfoRow icon={<User size={14} />}     label="Gender"        value={candidate.gender} />
            </div>
            <div style={{ background: B.bg, borderRadius: 10, padding: '18px 20px', border: `1.5px solid ${B.borderLight}` }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: B.textMid, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={13} color={B.textLight} /> Education & Experience
              </div>
              <InfoRow icon={<GraduationCap size={14} />} label="Education Level"  value={candidate.education_level} />
              <InfoRow icon={<BookOpen size={14} />}       label="Field of Study"   value={candidate.field_of_study} />
              <InfoRow icon={<Calendar size={14} />}       label="Graduation Year"  value={candidate.graduation_year?.toString()} />
              <InfoRow icon={<Briefcase size={14} />}      label="Experience"       value={`${candidate.experience_years} year(s)`} />
            </div>
          </div>

          {/* Skills & Certifications */}
          <div style={{ background: B.bg, borderRadius: 10, padding: '18px 20px', border: `1.5px solid ${B.borderLight}` }}>
            <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: B.textMid, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={13} color={B.textLight} /> Skills & Certifications
            </div>
            {candidate.skills && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '.75rem', color: B.textLight, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidate.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                    <span key={skill} style={{ padding: '4px 12px', borderRadius: 4, background: B.blueXLight, color: B.blueDark, fontSize: '.82rem', fontWeight: 700, border: `1.5px solid ${B.blueLight}` }}>{skill}</span>
                  ))}
                </div>
              </div>
            )}
            {candidate.certifications ? (
              <div>
                <div style={{ fontSize: '.75rem', color: B.textLight, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Certifications</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidate.certifications.split(',').map(s => s.trim()).filter(Boolean).map(cert => (
                    <span key={cert} style={{ padding: '4px 12px', borderRadius: 4, background: B.emeraldLight, color: B.emerald, fontSize: '.82rem', fontWeight: 700, border: `1.5px solid ${B.emerald}` }}>{cert}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '.85rem', color: B.textLight, fontStyle: 'italic' }}>No certifications listed</div>
            )}
          </div>

          {/* Documents */}
          <div style={{ background: B.bg, borderRadius: 10, padding: '18px 20px', border: `1.5px solid ${B.borderLight}` }}>
            <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: B.textMid, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={13} color={B.textLight} /> Uploaded Documents ({docs.length})
            </div>
            {loadingDocs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: B.textLight, fontSize: '.88rem' }}>No documents uploaded</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {docs.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: B.white, border: `1.5px solid ${B.borderLight}`, borderRadius: 8 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 6, background: B.blueXLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                      {DOC_TYPE_ICONS[doc.doc_type] || ''}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.9rem', color: B.text }}>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</div>
                      <div style={{ fontSize: '.75rem', color: B.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_name}</div>
                    </div>
                    <button onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, background: downloadingId === doc.id ? B.bg : B.blueXLight, border: `1.5px solid ${downloadingId === doc.id ? B.border : B.blue}`, color: downloadingId === doc.id ? B.textLight : B.blueDark, fontSize: '.78rem', fontWeight: 700, cursor: downloadingId === doc.id ? 'wait' : 'pointer' }}>
                      <Download size={13} />
                      {downloadingId === doc.id ? 'Saving…' : 'Download'}
                    </button>
                    <a href={`${API_BASE}/uploads/${doc.url?.split('/uploads/')[1] || ''}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, background: B.bg, border: `1.5px solid ${B.borderLight}`, color: B.textLight, fontSize: '.75rem', fontWeight: 700, textDecoration: 'none' }}>
                      <ExternalLink size={11} /> Open
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Reason */}
          {candidate.ai_reason && (
            <div style={{ background: B.bg, borderRadius: 10, padding: '18px 20px', border: `1.5px solid ${B.borderLight}` }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: B.textMid, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bot size={13} color={B.textLight} /> AI Decision Breakdown
              </div>
              <ReasonBreakdown reason={candidate.ai_reason} candidate={candidate} isHR />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Rank Badge ── */
function RankBadge({ rank, decision }) {
  if (decision !== 'shortlisted') return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: rank === 1 ? B.amber : rank === 2 ? B.textLight : rank === 3 ? B.amber : B.blueXLight, color: rank <= 3 ? '#fff' : B.blueDark, fontSize: '.75rem', fontWeight: 800, flexShrink: 0, marginRight: 6 }}>
      {rank}
    </span>
  )
}

/* ── System Users Overview Widget (white text on colored backgrounds) ── */
function SystemUsersOverview() {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  const fetchStats = () => {
    setLoading(true); setError(false)
    api.get('/hr/users')
      .then(res => {
        const users = res.data || []
        setStats({
          total:      users.length,
          admins:     users.filter(u => u.role === 'admin').length,
          hr:         users.filter(u => u.role === 'hr').length,
          applicants: users.filter(u => u.role === 'applicant').length,
        })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchStats() }, [])

  const roles = [
    { key: 'admins',     label: 'Admins',      icon: <Shield size={18} />,  color: '#fff', bg: B.violet,  border: B.violet,  desc: 'Full system control' },
    { key: 'hr',         label: 'HR Officers', icon: <UserCog size={18} />, color: '#fff', bg: B.sky,     border: B.sky,     desc: 'Manage candidates & jobs' },
    { key: 'applicants', label: 'Applicants',  icon: <Users size={18} />,   color: '#fff', bg: B.emerald, border: B.emerald, desc: 'Job seekers' },
  ]

  return (
    <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12, padding: '22px 26px', marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: B.blueXLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={16} color={B.blue} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: B.text }}>System Users</div>
            <div style={{ fontSize: '.78rem', color: B.textLight, marginTop: 1 }}>
              {loading ? 'Loading…' : error ? 'Could not load' : `${stats?.total ?? 0} registered accounts`}
            </div>
          </div>
        </div>
        <button onClick={fetchStats} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${B.border}`, background: B.bg, color: B.textMid, fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : error
          ? <div style={{ padding: '14px 16px', background: B.amberLight, border: `1.5px solid ${B.amber}`, borderRadius: 8, fontSize: '.88rem', color: B.amber, fontWeight: 600 }}>Could not load user stats.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {roles.map(r => (
                <div key={r.key} style={{ background: r.bg, border: `1.5px solid ${r.border}`, borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: r.color, marginBottom: 10 }}>{r.icon}<span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{r.label}</span></div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: r.color, lineHeight: 1, marginBottom: 4 }}>{stats?.[r.key] ?? 0}</div>
                  <div style={{ fontSize: '.75rem', color: r.color, opacity: 0.9, fontWeight: 600 }}>{r.desc}</div>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ── MAIN HR DASHBOARD
   ══════════════════════════════════════════════════════════════ */
export default function HRDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [serverStatus, setServerStatus] = useState(getServerStatus)
  const [wakeElapsed,  setWakeElapsed]  = useState(0)
  const wakeTimerRef = useRef(null)

  useEffect(() => {
    if (getServerStatus() !== 'awake') {
      wakeTimerRef.current = setInterval(() => setWakeElapsed(e => e + 1), 1000)
    }
    const unsub = onServerStatusChange(status => {
      setServerStatus(status)
      if (status === 'awake') {
        if (wakeTimerRef.current) { clearInterval(wakeTimerRef.current); wakeTimerRef.current = null }
      }
    })
    return () => { unsub(); if (wakeTimerRef.current) clearInterval(wakeTimerRef.current) }
  }, [])

  const [candidates,        setCandidates]        = useState([])
  const [jobs,              setJobs]              = useState([])
  const [selectedJob,       setSelectedJob]       = useState(null)
  const [filterDecision,    setFilterDecision]    = useState('all')
  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState(null)
  const [bulkLoading,       setBulkLoading]       = useState(false)
  const [bulkJobTitle,      setBulkJobTitle]      = useState('')
  const [bulkStatusData,    setBulkStatusData]    = useState(null)
  const [expandedRow,       setExpandedRow]       = useState(null)
  const [deleteTarget,      setDeleteTarget]      = useState(null)
  const [isDeleting,        setIsDeleting]        = useState(false)
  const [viewingProfileFor, setViewingProfileFor] = useState(null)
  const [downloadingDocId,  setDownloadingDocId]  = useState(null)
  const [isShortlisting, setIsShortlisting] = useState(false)

  const shortlistingRef = useRef(false)
  const selectedJobRef  = useRef(null)
  const pollIntervalRef = useRef(null)
  const pollActiveRef   = useRef(false)

  useEffect(() => { selectedJobRef.current = selectedJob }, [selectedJob])
  useEffect(() => {
    return () => {
      pollActiveRef.current = false
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    }
  }, [])

  const stopPolling = useCallback(() => {
    pollActiveRef.current = false
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [cRes, jRes] = await Promise.all([api.get('/hr/candidates'), api.get('/hr/jobs')])
      const allCandidates = cRes.data
      const seen   = new Set()
      const unique = jRes.data.filter(j => { if (seen.has(j.title)) return false; seen.add(j.title); return true })
      setCandidates(allCandidates)
      setJobs(unique)
      if (!selectedJobRef.current && unique.length > 0) {
        const first = unique.find(j => allCandidates.some(c => c.job_title === j.title)) || unique[0]
        setSelectedJob(first)
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load dashboard data'
      setError(msg); toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDeleteJob = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/jobs/${deleteTarget.id}`)
      toast.success(`"${deleteTarget.title}" deleted`)
      setJobs(prev => {
        const remaining = prev.filter(j => j.id !== deleteTarget.id)
        if (selectedJobRef.current?.id === deleteTarget.id) setSelectedJob(remaining.length > 0 ? remaining[0] : null)
        return remaining
      })
      setCandidates(prev => prev.filter(c => c.job_title !== deleteTarget.title))
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete position')
    } finally {
      setIsDeleting(false)
    }
  }

  const automateShortlist = useCallback(async (jobId, jobTitle) => {
    if (shortlistingRef.current) return
    shortlistingRef.current = true
    setIsShortlisting(true)
    setBulkJobTitle(jobTitle)
    setBulkStatusData(null)
    setBulkLoading(true)
    stopPolling()

    const resetShortlistState = () => {
      shortlistingRef.current = false
      setIsShortlisting(false)
      setBulkLoading(false)
      setBulkJobTitle('')
      setBulkStatusData(null)
    }

    try {
      const { data: startData } = await api.post(`/hr/shortlist-all/${jobId}`)
      if (!startData.processing) {
        toast.success(startData.message || `No pending candidates to process for "${jobTitle}".`, { duration: 6000 })
        await fetchData()
        resetShortlistState()
        return
      }

      const startedAt = Date.now()
      pollActiveRef.current = true
      pollIntervalRef.current = setInterval(async () => {
        if (!pollActiveRef.current) { stopPolling(); return }
        if (Date.now() - startedAt > POLL_MAX_WAIT_MS) {
          stopPolling()
          toast.error('Shortlisting is taking too long — please refresh.', { duration: 10_000 })
          await fetchData()
          resetShortlistState()
          return
        }
        try {
          const { data: status } = await api.get(`/hr/shortlist-status/${jobId}`)
          if (!pollActiveRef.current) return
          setBulkStatusData(status)
          if (!status.processing) {
            stopPolling()
            await fetchData()
            const processed        = status.total            ?? 0
            const shortlistedCount = status.shortlisted      ?? 0
            const rejectedCount    = status.not_shortlisted  ?? 0
            const errorCount       = status.errors           ?? 0
            if (errorCount > 0) {
              toast.success(`Processed ${processed} — ${shortlistedCount} shortlisted, ${rejectedCount} rejected, ${errorCount} errors`, { duration: 8000 })
            } else {
              toast.success(`Processed ${processed} — ${shortlistedCount} shortlisted, ${rejectedCount} rejected`, { duration: 6000 })
            }
            resetShortlistState()
          }
        } catch (pollErr) { console.warn('[poll]', pollErr?.message) }
      }, POLL_INTERVAL_MS)

    } catch (err) {
      stopPolling()
      const isTimeout = !err.response
      const detail    = err.response?.data?.detail
      if (isTimeout) toast.error('The shortlisting request timed out.', { duration: 10_000 })
      else toast.error(detail || 'Automated shortlisting failed', { duration: 8000 })
      resetShortlistState()
    }
  }, [fetchData, stopPolling])

  const handleTableDownload = async (doc) => {
    setDownloadingDocId(doc.id)
    await downloadDocument(doc.id, doc.original_name || doc.doc_type)
    setDownloadingDocId(null)
  }

  const applicantCountByTitle = candidates.reduce((acc, c) => { acc[c.job_title] = (acc[c.job_title] || 0) + 1; return acc }, {})
  const jobCandidates    = selectedJob ? candidates.filter(c => c.job_title === selectedJob.title) : []
  const rankedCandidates = rankCandidates(jobCandidates)
  const filtered         = rankedCandidates.filter(c => filterDecision === 'all' ? true : c.decision === filterDecision)

  const total       = candidates.length
  const shortlisted = candidates.filter(c => c.decision === 'shortlisted').length
  const rejected    = candidates.filter(c => c.decision === 'not_shortlisted').length
  const unprocessed = candidates.filter(c => c.decision === 'pending').length
  const expiredJobsCount = jobs.filter(j => isDeadlineExpired(j.deadline)).length

  const jobShortlisted = jobCandidates.filter(c => c.decision === 'shortlisted').length
  const jobRejected    = jobCandidates.filter(c => c.decision === 'not_shortlisted').length
  const jobUnprocessed = jobCandidates.filter(c => c.decision === 'pending').length

  const shortlistedRanked = rankedCandidates.filter(c => c.decision === 'shortlisted').map((c, i) => ({ id: c.application_id, rank: i + 1 }))
  const rankMap = Object.fromEntries(shortlistedRanked.map(r => [r.id, r.rank]))

  const buttonDisabled = bulkLoading || isShortlisting || jobCandidates.length === 0

  return (
    <>
      <Helmet><title>HR Dashboard — Shortlisting AI</title></Helmet>

      {bulkLoading && <ProcessingOverlay jobTitle={bulkJobTitle} statusData={bulkStatusData} />}
      {deleteTarget && <DeleteJobModal job={deleteTarget} onConfirm={handleDeleteJob} onCancel={() => setDeleteTarget(null)} isDeleting={isDeleting} />}
      {viewingProfileFor && <CandidateProfileModal candidate={viewingProfileFor} onClose={() => setViewingProfileFor(null)} />}

      <div className="page-wrapper" style={{ background: B.bg, minHeight: '100vh' }}>
        <Navbar />
        <div className="container" style={{ padding: '48px 28px 80px', maxWidth: 1400, margin: '0 auto' }}>

          {/* Header */}
          <div className="fade-up" style={{ marginBottom: 28 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: B.blue, marginBottom: 8 }}>HR Portal</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: B.text }}>HR Dashboard</h1>
                <div style={{ width: 44, height: 4, background: `linear-gradient(90deg, ${B.blue}, ${B.sky})`, marginTop: 10, borderRadius: 2 }} />
                <p style={{ color: B.textLight, marginTop: 10, fontSize: '1rem', fontWeight: 500 }}>
                  Welcome, {user?.fullName || user?.full_name}. Manage candidates and job positions below.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, fontSize: '.85rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
                  <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                </button>
                <button onClick={() => navigate('/hr/jobs/new')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 8, background: B.blue, color: '#fff', fontWeight: 700, fontSize: '.85rem', border: 'none', cursor: 'pointer' }}>
                  + Post Position
                </button>
              </div>
            </div>
          </div>

          <WakeServerBanner status={serverStatus} elapsedSeconds={wakeElapsed} />
          <div className="fade-up fade-up-1"><SystemUsersOverview /></div>

          <div className="fade-up fade-up-1" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Users size={18} color={B.blue} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: B.text, margin: 0 }}>Candidates & Jobs</h2>
            </div>
            <p style={{ fontSize: '.9rem', color: B.textLight, margin: 0 }}>Review applications, run AI shortlisting, and manage job postings.</p>
          </div>

          {/* Stats cards */}
          <div className="fade-up fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total Applicants',   value: total,       icon: <Users size={17} />,       color: B.text,    bg: B.bg,           border: B.border },
              { label: 'Shortlisted',        value: shortlisted, icon: <CheckCircle size={17} />, color: B.emerald, bg: B.emeraldLight, border: B.emerald },
              { label: 'Not Shortlisted',    value: rejected,    icon: <XCircle size={17} />,     color: B.red,     bg: B.redLight,     border: B.red },
              ...(unprocessed > 0 ? [{ label: 'Awaiting AI', value: unprocessed, icon: <Bot size={17} />, color: B.amber, bg: B.amberLight, border: B.amber }] : []),
              ...(expiredJobsCount > 0 ? [{ label: 'Expired Positions', value: expiredJobsCount, icon: <Clock size={17} />, color: B.textLight, bg: B.bg, border: B.border }] : []),
            ].map(({ label, value, icon, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `2px solid ${border}`, borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color, marginBottom: 10 }}>
                  {icon}
                  <span style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 16 }}>
              <div className="spinner" style={{ width: 40, height: 40 }} />
              <div style={{ fontSize: '.95rem', color: B.textLight, fontWeight: 600 }}>
                {serverStatus !== 'awake' ? 'Waiting for server to wake up…' : 'Loading candidates…'}
              </div>
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: '24px 28px', background: B.redLight, border: `2px solid ${B.red}`, borderRadius: 12, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <AlertCircle size={18} color={B.red} />
                <span style={{ fontWeight: 800, fontSize: '.95rem', color: B.red }}>Failed to load dashboard data</span>
              </div>
              <p style={{ fontSize: '.88rem', color: '#7f1d1d', margin: '0 0 14px', lineHeight: 1.6 }}>{error}</p>
              <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: B.red, color: '#fff', fontWeight: 700, fontSize: '.88rem', border: 'none', cursor: 'pointer' }}>
                <RefreshCw size={13} /> Try Again
              </button>
            </div>
          )}

          {!loading && !error && jobs.length > 0 && (
            <div className="fade-up fade-up-2" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `2px solid ${B.border}`, marginBottom: 0 }}>
              {jobs.map(job => {
                const count    = applicantCountByTitle[job.title] || 0
                const isActive = selectedJob?.id === job.id
                const expired  = isDeadlineExpired(job.deadline)
                return (
                  <button key={job.id} onClick={() => { setSelectedJob(job); setFilterDecision('all'); setExpandedRow(null) }} style={{ padding: '10px 20px', border: 'none', borderBottom: isActive ? `3px solid ${B.blue}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: isActive ? 800 : 600, fontSize: '.95rem', color: isActive ? B.blue : expired ? '#b91c1c' : B.textLight, display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s', marginBottom: -2 }}>
                    {job.title}
                    {expired && <span style={{ fontSize: '.68rem', fontWeight: 800, background: B.redLight, color: B.red, border: `1.5px solid ${B.red}`, borderRadius: 4, padding: '1px 6px' }}>Expired</span>}
                    {count > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', background: isActive ? B.blue : B.border, color: isActive ? '#fff' : B.textMid, borderRadius: 4, fontSize: '.72rem', fontWeight: 800 }}>{count}</span>}
                  </button>
                )
              })}
            </div>
          )}

          {!loading && !error && selectedJob && (
            <div className="card fade-up fade-up-3" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '22px 26px', borderTop: 'none', background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: B.text }}>{selectedJob.title}</h2>
                    {isDeadlineExpired(selectedJob.deadline) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.75rem', fontWeight: 800, background: B.redLight, color: B.red, border: `1.5px solid ${B.red}`, borderRadius: 4, padding: '2px 9px' }}>
                        <AlertCircle size={10} /> Deadline Passed — Hidden from Applicants
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: '.9rem' }}>
                    <span style={{ color: B.emerald, fontWeight: 700 }}>✓ {jobShortlisted} shortlisted</span>
                    <span style={{ color: B.red, fontWeight: 700 }}>✗ {jobRejected} rejected</span>
                    {jobUnprocessed > 0 && <span style={{ color: B.amber, fontWeight: 700 }}>⚡ {jobUnprocessed} awaiting evaluation</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => navigate(`/hr/report/${selectedJob.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                    <BarChart2 size={13} /> View Report
                  </button>
                  <button
                    onClick={() => automateShortlist(selectedJob.id, selectedJob.title)}
                    disabled={buttonDisabled}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 8,
                      background: buttonDisabled ? B.textLight : B.blue,
                      color: '#fff', fontWeight: 700, fontSize: '.85rem', border: 'none',
                      cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                      opacity: buttonDisabled ? 0.6 : 1,
                      transition: 'all .15s',
                    }}
                  >
                    {isShortlisting
                      ? <><div className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Processing…</>
                      : <><Bot size={14} /> Automate Shortlisting</>
                    }
                    {!isShortlisting && jobUnprocessed > 0 && (
                      <span style={{ minWidth: 20, height: 20, padding: '0 5px', background: 'rgba(0,0,0,0.18)', color: '#fff', borderRadius: 4, fontSize: '.7rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {jobUnprocessed}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setDeleteTarget(selectedJob)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: B.redLight, border: `1.5px solid ${B.red}`, color: B.red, fontSize: '.9rem', fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = B.red; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = B.redLight; e.currentTarget.style.color = B.red }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <select style={{ width: 'auto', minWidth: 170, color: B.text, border: `1.5px solid ${B.border}`, borderRadius: 8, padding: '8px 12px', background: B.white }} value={filterDecision} onChange={e => { setFilterDecision(e.target.value); setExpandedRow(null) }}>
                  <option value="all">All Decisions</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="not_shortlisted">Not Shortlisted</option>
                </select>
                <span style={{ fontSize: '.92rem', color: B.textLight, fontWeight: 600 }}>{filtered.length} of {jobCandidates.length} candidates</span>
                {filtered.length > 0 && filterDecision !== 'not_shortlisted' && (
                  <span style={{ fontSize: '.78rem', color: B.emerald, background: B.emeraldLight, padding: '4px 11px', borderRadius: 4, border: `1.5px solid ${B.emerald}`, letterSpacing: '.04em', fontWeight: 700 }}>
                    Ranked by AI score
                  </span>
                )}
              </div>

              {filtered.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: B.text }}>No candidates found</h3>
                  <p style={{ fontSize: '.95rem', color: B.textLight }}>{jobCandidates.length === 0 ? 'No applications for this position yet.' : 'Try adjusting the filter.'}</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${B.border}`, background: B.navy }}>
                        {['Rank', 'Name', 'Education', 'Experience', 'Decision', 'AI Score', 'Documents', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontWeight: 800, fontSize: '.75rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => (
                        <React.Fragment key={c.application_id}>
                          <tr
                            style={{ borderBottom: expandedRow === c.application_id ? 'none' : `1px solid ${B.borderLight}`, background: i % 2 === 0 ? B.white : B.bg, transition: 'background .15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = B.blueXLight}
                            onMouseLeave={e => e.currentTarget.style.background = expandedRow === c.application_id ? B.blueXLight : i % 2 === 0 ? B.white : B.bg}
                          >
                            <td style={{ padding: '15px 18px' }}>
                              {c.decision === 'shortlisted'
                                ? <RankBadge rank={rankMap[c.application_id]} decision={c.decision} />
                                : <span style={{ color: B.border, fontSize: '.9rem', fontWeight: 700 }}>—</span>}
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ fontWeight: 700, fontSize: '1rem', color: B.text }}>{c.full_name}</div>
                              <div style={{ fontSize: '.82rem', color: B.textLight, fontWeight: 500 }}>{c.email}</div>
                              {c.phone && <div style={{ fontSize: '.78rem', color: B.textLight, display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}><Phone size={10} />{c.phone}</div>}
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ fontSize: '.95rem', color: B.text, fontWeight: 600 }}>{c.education_level}</div>
                              <div style={{ fontSize: '.82rem', color: B.textLight }}>{c.field_of_study}</div>
                            </td>
                            <td style={{ padding: '15px 18px', fontSize: '.95rem', color: B.textMid, fontWeight: 600 }}>{c.experience_years} yrs</td>
                            <td style={{ padding: '15px 18px' }}><DecisionBadge decision={c.decision} /></td>
                            <td style={{ padding: '15px 18px' }}>
                              {c.ai_score != null
                                ? <span style={{ fontWeight: 800, fontSize: '1rem', color: c.ai_score >= PASS_THRESHOLD ? B.emerald : B.red }}>{(c.ai_score * 100).toFixed(1)}%</span>
                                : <span style={{ color: B.border, fontSize: '.9rem', fontWeight: 600 }}>—</span>}
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {c.doc_verified
                                  ? <span style={{ color: B.emerald, fontSize: '.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><ShieldCheck size={13} /> Verified</span>
                                  : <span style={{ color: B.sky, fontSize: '.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Bot size={12} /> AI verified</span>}
                                {(c.documents || []).slice(0, 3).map(doc => (
                                  <button key={doc.id} onClick={() => handleTableDownload(doc)} disabled={downloadingDocId === doc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, background: B.blueXLight, border: `1px solid ${B.blue}`, color: B.blueDark, fontSize: '.7rem', fontWeight: 700, cursor: downloadingDocId === doc.id ? 'wait' : 'pointer', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <Download size={10} />
                                    {downloadingDocId === doc.id ? '…' : (DOC_TYPE_ICONS[doc.doc_type] || '') + ' ' + (doc.doc_type || 'doc')}
                                  </button>
                                ))}
                                {(c.documents || []).length > 3 && <span style={{ fontSize: '.7rem', color: B.textLight, fontWeight: 600 }}>+{c.documents.length - 3} more</span>}
                              </div>
                            </td>
                            <td style={{ padding: '15px 18px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <button onClick={() => setViewingProfileFor(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: B.blueXLight, border: `1.5px solid ${B.blueLight}`, color: B.blueDark, fontSize: '.8rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  <User size={12} /> Full Profile
                                </button>
                                {c.ai_reason && (
                                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: B.textLight, fontSize: '.8rem', fontWeight: 700, padding: 0 }} onClick={() => setExpandedRow(expandedRow === c.application_id ? null : c.application_id)}>
                                    {expandedRow === c.application_id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    {expandedRow === c.application_id ? 'Hide AI' : 'AI Reason'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandedRow === c.application_id && (
                            <tr style={{ borderBottom: `1px solid ${B.borderLight}` }}>
                              <td colSpan={8} style={{ padding: '0 18px 18px', background: B.blueXLight }}>
                                <div style={{ padding: '18px 22px', background: B.white, borderRadius: 8, border: `1.5px solid ${B.borderLight}` }}>
                                  <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: B.text }}>
                                    <Bot size={15} color={B.blue} /> AI Decision Breakdown — {c.full_name}
                                    {c.decision === 'shortlisted' && rankMap[c.application_id] && <span style={{ fontSize: '.85rem', color: B.textLight, marginLeft: 4 }}>· Rank #{rankMap[c.application_id]}</span>}
                                  </div>
                                  <ReasonBreakdown reason={c.ai_reason} candidate={c} isHR />
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

          {!loading && !error && jobs.length === 0 && (
            <div style={{ padding: '64px 40px', textAlign: 'center', marginTop: 20, background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12 }}>
              <div style={{ fontSize: '3rem', marginBottom: 18 }}></div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 10, color: B.text }}>No positions posted yet</h3>
              <p style={{ color: B.textLight, marginBottom: 26, fontSize: '.95rem' }}>Create your first job posting to start receiving and shortlisting applicants.</p>
              <button onClick={() => navigate('/hr/jobs/new')} style={{ padding: '10px 24px', borderRadius: 8, background: B.blue, color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                + Post First Position
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}