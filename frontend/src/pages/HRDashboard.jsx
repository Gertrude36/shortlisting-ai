import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Users, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Bot, ShieldCheck, ShieldX, Trash2,
  FileText, Eye, X, ExternalLink, BarChart2,
  UserPlus, UserCog, Mail, Lock, AlertCircle, Clock,
  ScrollText, Phone, MapPin, Calendar, GraduationCap,
  Briefcase, Award, User, BookOpen, Download
} from 'lucide-react'
import React from 'react'
import toast          from 'react-hot-toast'
import Navbar         from '../components/Navbar'
import DecisionBadge  from '../components/DecisionBadge'
import ReasonBreakdown from '../components/ReasonBreakdown'
import SystemLogs     from '../components/SystemLogs'
import { useAuth }    from '../context/AuthContext'
import api            from '../api/axios'

const PASS_THRESHOLD = 0.40
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const DOC_TYPE_LABELS = { id_card: 'National ID / Passport', cv: 'CV / Resume', diploma: 'Academic Diploma', certificate: 'Professional Certificate', experience: 'Experience Document' }
const DOC_TYPE_ICONS  = { id_card: '🪪', cv: '📄', diploma: '🎓', certificate: '📜', experience: '💼' }
const DECISION_ORDER  = { shortlisted: 0, not_shortlisted: 1, pending: 2 }

const POLL_INTERVAL_MS  = 3000
const POLL_MAX_WAIT_MS  = 600000

// ── Projector-safe colour constants ─────────────────────────────────────────
const CLR = {
  ink:        '#0b0f1a',
  slate:      '#1e293b',
  muted:      '#374151',
  border:     '#9ca3af',
  surface:    '#f3f4f6',
  white:      '#ffffff',
  accent:     '#1d4ed8',
  accentLt:   '#bfdbfe',
  accentDk:   '#1e3a8a',
  green:      '#15803d',
  greenLt:    '#bbf7d0',
  red:        '#b91c1c',
  redLt:      '#fecaca',
  amber:      '#92400e',
  amberLt:    '#fde68a',
  teal:       '#0369a1',
  tealLt:     '#bae6fd',
}

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

// ── Document download helper ─────────────────────────────────────────────────
async function downloadDocument(docId, originalName) {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
    const res = await fetch(`${API_BASE}/hr/documents/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      toast.error(`Download failed: ${res.statusText}`)
      return
    }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = originalName || 'document'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Downloading "${originalName}"`)
  } catch (err) {
    toast.error('Download failed. Please try again.')
    console.error('[download]', err)
  }
}

/* ── Processing overlay ── */
function ProcessingOverlay({ jobTitle, statusData }) {
  const steps = [
    { icon: '🔍', label: 'Scanning applicant data…' },
    { icon: '📄', label: 'Extracting document text via OCR…' },
    { icon: '🔗', label: 'Cross-checking form vs documents…' },
    { icon: '🎯', label: 'Matching against job requirements…' },
    { icon: '🤖', label: 'Running AI shortlisting model…' },
    { icon: '✅', label: 'Ranking and finalising decisions…' },
  ]
  const [step,    setStep]    = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 900)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const elapsedLabel = elapsed < 60
    ? `${elapsed}s`
    : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`

  const total = statusData?.total || 0
  const done  = statusData?.done  || 0
  const progressPct = total > 0
    ? Math.min((done / total) * 100, 100)
    : Math.min(((elapsed / 120) * 100), 95)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,12,20,.75)', backdropFilter: 'blur(6px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{ padding: '44px 52px', maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2.8rem', marginBottom: 18 }}>{steps[step].icon}</div>
        <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 8, color: CLR.ink }}>
          AI Shortlisting + Document Verification
        </div>
        <div style={{ fontSize: '.95rem', color: CLR.muted, marginBottom: 6 }}>{jobTitle}</div>
        {total > 0 && (
          <div style={{ fontSize: '.9rem', color: CLR.slate, marginBottom: 6, fontWeight: 700 }}>
            Processing {done} of {total} candidate{total !== 1 ? 's' : ''}…
          </div>
        )}
        <div style={{
          fontSize: '.82rem', color: elapsed >= 15 ? CLR.amber : 'transparent',
          marginBottom: 16, fontWeight: 700, transition: 'color .5s',
        }}>
          ⏱ {elapsedLabel} — OCR + AI processing takes 30–120s per applicant. Please wait…
        </div>
        <div style={{ fontSize: '.95rem', color: CLR.slate, minHeight: 28 }}>{steps[step].label}</div>
        <div style={{ marginTop: 22, height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: CLR.accent,
            width: `${progressPct}%`,
            transition: 'width .9s ease', borderRadius: 99,
          }} />
        </div>
        {statusData?.errors > 0 && (
          <div style={{ marginTop: 14, fontSize: '.8rem', color: CLR.red, fontWeight: 600 }}>
            ⚠ {statusData.errors} candidate{statusData.errors > 1 ? 's' : ''} could not be processed — will be marked for HR review.
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Delete Job modal ── */
function DeleteJobModal({ job, onConfirm, onCancel, isDeleting }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.70)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: CLR.white, borderRadius: 14, width: '100%', maxWidth: 420, padding: '40px 36px', boxShadow: '0 28px 72px rgba(10,15,40,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: CLR.redLt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <Trash2 size={26} color={CLR.red} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: CLR.ink, margin: '0 0 12px', textAlign: 'center' }}>Delete this position?</h3>
        <p style={{ fontSize: '.95rem', color: CLR.muted, lineHeight: 1.7, margin: '0 0 10px', textAlign: 'center' }}>
          Permanently delete <strong style={{ color: CLR.ink }}>{job?.title}</strong>.
        </p>
        <div style={{ padding: '12px 16px', background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 8, marginBottom: 28, width: '100%' }}>
          <p style={{ fontSize: '.85rem', color: CLR.amber, margin: 0, lineHeight: 1.6, textAlign: 'center', fontWeight: 600 }}>
            ⚠ All applications and uploaded documents will also be permanently deleted. This cannot be undone.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel} disabled={isDeleting}>Cancel</button>
          <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 4, background: isDeleting ? CLR.redLt : CLR.red, border: 'none', color: CLR.white, fontSize: '.95rem', fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }} onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Deleting…</> : <><Trash2 size={14} /> Delete Position</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Delete User modal ── */
function DeleteUserModal({ user, onConfirm, onCancel, isDeleting }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.70)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: CLR.white, borderRadius: 14, width: '100%', maxWidth: 420, padding: '40px 36px', boxShadow: '0 28px 72px rgba(10,15,40,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: CLR.redLt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <Trash2 size={26} color={CLR.red} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: CLR.ink, margin: '0 0 12px', textAlign: 'center' }}>Delete this account?</h3>
        <p style={{ fontSize: '.95rem', color: CLR.muted, lineHeight: 1.7, margin: '0 0 10px', textAlign: 'center' }}>
          Permanently delete <strong style={{ color: CLR.ink }}>{user?.full_name}</strong> (<em>{user?.email}</em>).
        </p>
        <div style={{ padding: '12px 16px', background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 8, marginBottom: 28, width: '100%' }}>
          <p style={{ fontSize: '.85rem', color: CLR.amber, margin: 0, lineHeight: 1.6, textAlign: 'center', fontWeight: 600 }}>
            ⚠ All applications and uploaded documents belonging to this account will also be permanently deleted.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel} disabled={isDeleting}>Cancel</button>
          <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 4, background: isDeleting ? CLR.redLt : CLR.red, border: 'none', color: CLR.white, fontSize: '.95rem', fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }} onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Deleting…</> : <><Trash2 size={14} /> Delete Account</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Add User modal ── */
function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'applicant' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.full_name.trim() || form.full_name.trim().length < 2) e.full_name = 'Full name must be at least 2 characters'
    if (!form.email.trim()) e.email = 'Email is required'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    return e
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    try {
      const { data } = await api.post('/hr/users', form)
      toast.success(`Account created for ${data.full_name}`)
      onCreated(data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const field = (key, label, type = 'text', icon) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 700, color: CLR.slate, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: CLR.border, pointerEvents: 'none' }}>{icon}</span>}
        <input type={type} value={form[key]} onChange={e => { setForm(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: undefined })) }} className="form-input" style={{ width: '100%', paddingLeft: icon ? 34 : 12, boxSizing: 'border-box', borderColor: errors[key] ? '#ef4444' : undefined, color: CLR.ink }} placeholder={label} />
      </div>
      {errors[key] && <p style={{ fontSize: '.78rem', color: '#ef4444', margin: '4px 0 0', fontWeight: 600 }}>{errors[key]}</p>}
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.70)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: CLR.white, borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 28px 72px rgba(10,15,40,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>Add New Account</div>
              <div style={{ fontSize: '.8rem', color: '#bfdbfe' }}>Create a system user account</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}><X size={14} /></button>
        </div>
        <div style={{ padding: '26px 28px' }}>
          {field('full_name', 'Full Name', 'text', <Users size={13} />)}
          {field('email', 'Email Address', 'email', <Mail size={13} />)}
          {field('password', 'Password', 'password', <Lock size={13} />)}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 700, color: CLR.slate, marginBottom: 8 }}>Account Role</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ value: 'applicant', label: '👤 Job Applicant', desc: 'Can browse & apply for jobs' }, { value: 'hr', label: '🛡 HR Officer', desc: 'Full admin access' }].map(opt => (
                <button key={opt.value} onClick={() => setForm(p => ({ ...p, role: opt.value }))} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${form.role === opt.value ? CLR.accent : '#e5e7eb'}`, background: form.role === opt.value ? '#eff6ff' : CLR.white, textAlign: 'center', transition: 'all .15s' }}>
                  <div style={{ fontWeight: 800, fontSize: '.9rem', color: form.role === opt.value ? CLR.accent : CLR.slate }}>{opt.label}</div>
                  <div style={{ fontSize: '.75rem', color: CLR.muted, marginTop: 3 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose} disabled={loading}>Cancel</button>
            <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 4, background: loading ? '#93c5fd' : CLR.accent, border: 'none', color: '#fff', fontSize: '.95rem', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }} onClick={handleSubmit} disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Creating…</> : <><UserPlus size={14} /> Create Account</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Full Candidate Profile Modal ── */
function CandidateProfileModal({ candidate, onClose }) {
  const [docs, setDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ color: CLR.border, flexShrink: 0, marginTop: 1 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: CLR.border, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: '.92rem', color: CLR.ink, fontWeight: 600, lineHeight: 1.5 }}>{value}</div>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.75)', backdropFilter: 'blur(6px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: CLR.white, borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 28px 72px rgba(10,15,40,.28)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '28px 28px 24px', borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {candidate.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>{candidate.full_name}</div>
                <div style={{ fontSize: '.88rem', color: '#bfdbfe', marginTop: 2 }}>{candidate.email}</div>
                <div style={{ fontSize: '.8rem', color: '#93c5fd', marginTop: 4 }}>
                  Applying for: <strong style={{ color: '#fff' }}>{candidate.job_title}</strong>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Decision banner */}
          <div style={{
            padding: '16px 20px', borderRadius: 10,
            background: candidate.decision === 'shortlisted' ? '#f0fdf4' : candidate.decision === 'not_shortlisted' ? '#fef2f2' : '#fffbeb',
            border: `2px solid ${candidate.decision === 'shortlisted' ? '#86efac' : candidate.decision === 'not_shortlisted' ? '#fca5a5' : '#fcd34d'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: '1.6rem' }}>
              {candidate.decision === 'shortlisted' ? '✅' : candidate.decision === 'not_shortlisted' ? '❌' : '⏳'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.95rem', color: candidate.decision === 'shortlisted' ? '#14532d' : candidate.decision === 'not_shortlisted' ? '#7f1d1d' : '#78350f' }}>
                {candidate.decision === 'shortlisted' ? 'Shortlisted' : candidate.decision === 'not_shortlisted' ? 'Not Shortlisted' : 'Pending Evaluation'}
              </div>
              {candidate.ai_score != null && (
                <div style={{ fontSize: '.85rem', color: CLR.muted, marginTop: 2, fontWeight: 600 }}>
                  AI Score: <strong style={{ color: candidate.ai_score >= PASS_THRESHOLD ? CLR.green : CLR.red }}>{(candidate.ai_score * 100).toFixed(1)}%</strong>
                </div>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: CLR.surface, borderRadius: 10, padding: '18px 20px', border: '1.5px solid #e5e7eb' }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: CLR.slate, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={13} color={CLR.muted} /> Personal Information
              </div>
              <InfoRow icon={<Mail size={14} />}     label="Email"         value={candidate.email} />
              <InfoRow icon={<Phone size={14} />}    label="Phone"         value={candidate.phone} />
              <InfoRow icon={<MapPin size={14} />}   label="Address"       value={candidate.address} />
              <InfoRow icon={<Calendar size={14} />} label="Date of Birth" value={candidate.date_of_birth} />
              <InfoRow icon={<User size={14} />}     label="Gender"        value={candidate.gender} />
            </div>
            <div style={{ background: CLR.surface, borderRadius: 10, padding: '18px 20px', border: '1.5px solid #e5e7eb' }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: CLR.slate, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={13} color={CLR.muted} /> Education & Experience
              </div>
              <InfoRow icon={<GraduationCap size={14} />} label="Education Level"  value={candidate.education_level} />
              <InfoRow icon={<BookOpen size={14} />}       label="Field of Study"   value={candidate.field_of_study} />
              <InfoRow icon={<Calendar size={14} />}       label="Graduation Year"  value={candidate.graduation_year?.toString()} />
              <InfoRow icon={<Briefcase size={14} />}      label="Experience"       value={`${candidate.experience_years} year(s)`} />
            </div>
          </div>

          {/* Skills & Certs */}
          <div style={{ background: CLR.surface, borderRadius: 10, padding: '18px 20px', border: '1.5px solid #e5e7eb' }}>
            <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: CLR.slate, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={13} color={CLR.muted} /> Skills & Certifications
            </div>
            {candidate.skills && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '.75rem', color: CLR.muted, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidate.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                    <span key={skill} style={{ padding: '4px 12px', borderRadius: 4, background: '#eff6ff', color: CLR.accentDk, fontSize: '.82rem', fontWeight: 700, border: `1.5px solid ${CLR.accentLt}` }}>{skill}</span>
                  ))}
                </div>
              </div>
            )}
            {candidate.certifications ? (
              <div>
                <div style={{ fontSize: '.75rem', color: CLR.muted, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Certifications</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidate.certifications.split(',').map(s => s.trim()).filter(Boolean).map(cert => (
                    <span key={cert} style={{ padding: '4px 12px', borderRadius: 4, background: '#f0fdf4', color: CLR.green, fontSize: '.82rem', fontWeight: 700, border: '1.5px solid #86efac' }}>{cert}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '.85rem', color: CLR.border, fontStyle: 'italic' }}>No certifications listed</div>
            )}
          </div>

          {/* Documents — with download buttons */}
          <div style={{ background: CLR.surface, borderRadius: 10, padding: '18px 20px', border: '1.5px solid #e5e7eb' }}>
            <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: CLR.slate, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={13} color={CLR.muted} /> Uploaded Documents ({docs.length})
            </div>
            {loadingDocs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: CLR.border, fontSize: '.88rem' }}>No documents uploaded</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {docs.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: CLR.white, border: '1.5px solid #e5e7eb', borderRadius: 8 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 6, background: CLR.accentLt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                      {DOC_TYPE_ICONS[doc.doc_type] || '📄'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.9rem', color: CLR.ink }}>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</div>
                      <div style={{ fontSize: '.75rem', color: CLR.border, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_name}</div>
                    </div>
                    {/* ✅ Download button */}
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      title={`Download ${doc.original_name}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 6,
                        background: downloadingId === doc.id ? CLR.surface : CLR.accentLt,
                        border: `1.5px solid ${downloadingId === doc.id ? CLR.border : CLR.accent}`,
                        color: downloadingId === doc.id ? CLR.muted : CLR.accentDk,
                        fontSize: '.78rem', fontWeight: 700, cursor: downloadingId === doc.id ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap', transition: 'all .15s',
                      }}
                    >
                      <Download size={13} />
                      {downloadingId === doc.id ? 'Saving…' : 'Download'}
                    </button>
                    <a
                      href={`${API_BASE}/uploads/${doc.url?.split('/uploads/')[1] || ''}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, background: CLR.surface, border: '1.5px solid #e5e7eb', color: CLR.muted, fontSize: '.75rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                      <ExternalLink size={11} /> Open
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI breakdown */}
          {candidate.ai_reason && (
            <div style={{ background: CLR.surface, borderRadius: 10, padding: '18px 20px', border: '1.5px solid #e5e7eb' }}>
              <div style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: CLR.slate, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bot size={13} color={CLR.muted} /> AI Decision Breakdown
              </div>
              <ReasonBreakdown reason={candidate.ai_reason} candidate={candidate} />
            </div>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: rank === 1 ? '#b45309' : rank === 2 ? '#64748b' : rank === 3 ? '#92400e' : CLR.accentLt, color: rank <= 3 ? '#fff' : CLR.accentDk, fontSize: '.75rem', fontWeight: 800, flexShrink: 0, marginRight: 6 }}>
      {rank}
    </span>
  )
}

/* ── Role badge ── */
function RoleBadge({ role }) {
  const isHR = role === 'hr'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 99, background: isHR ? '#ede9fe' : '#f0fdf4', border: `1.5px solid ${isHR ? '#c4b5fd' : '#86efac'}`, color: isHR ? '#5b21b6' : CLR.green, fontSize: '.78rem', fontWeight: 800 }}>
      {isHR ? '🛡 HR' : '👤 Applicant'}
    </span>
  )
}

/* ═══════════════════════════════════════
   ── Users Management Tab ──
   ═══════════════════════════════════════ */
function UsersTab({ currentUserId }) {
  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting]     = useState(false)
  const [roleFilter, setRoleFilter]     = useState('all')

  const fetchUsers = () => {
    setLoading(true)
    api.get('/hr/users')
      .then(res => setUsers(res.data))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/hr/users/${deleteTarget.id}`)
      toast.success(`Account for "${deleteTarget.full_name}" deleted`)
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete account')
    } finally {
      setIsDeleting(false)
    }
  }

  const filtered = users.filter(u => roleFilter === 'all' ? true : u.role === roleFilter)
  const totalHR  = users.filter(u => u.role === 'hr').length
  const totalApp = users.filter(u => u.role === 'applicant').length

  const fmt = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <>
      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} onCreated={newUser => setUsers(prev => [newUser, ...prev])} />}
      {deleteTarget && <DeleteUserModal user={deleteTarget} onConfirm={handleDeleteUser} onCancel={() => setDeleteTarget(null)} isDeleting={isDeleting} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Accounts', value: users.length, bg: CLR.surface,   border: '#e5e7eb', color: CLR.ink     },
          { label: 'HR Officers',    value: totalHR,       bg: '#ede9fe', border: '#c4b5fd', color: '#5b21b6'  },
          { label: 'Applicants',     value: totalApp,      bg: '#f0fdf4', border: '#86efac', color: CLR.green  },
        ].map(({ label, value, bg, border, color }) => (
          <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" style={{ width: 'auto', minWidth: 160, color: CLR.ink }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">All Roles ({users.length})</option>
            <option value="hr">HR Officers ({totalHR})</option>
            <option value="applicant">Applicants ({totalApp})</option>
          </select>
          <span style={{ fontSize: '.9rem', color: CLR.muted, fontWeight: 600 }}>{filtered.length} {filtered.length === 1 ? 'account' : 'accounts'}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={fetchUsers}><RefreshCw size={13} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserPlus size={14} /> Add Account
          </button>
        </div>
      </div>

      <div style={{ background: CLR.white, border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 36, height: 36 }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: CLR.ink, marginBottom: 6 }}>No accounts found</h3>
            <p style={{ fontSize: '.95rem', color: CLR.muted }}>{users.length === 0 ? 'No users in the system yet.' : 'Try adjusting the filter.'}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: CLR.surface, borderBottom: '2px solid #e5e7eb' }}>
                  {['#', 'Full Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontWeight: 800, fontSize: '.75rem', color: CLR.slate, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const isSelf = u.id === currentUserId
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #e5e7eb', background: isSelf ? '#fffbeb' : i % 2 === 0 ? CLR.white : CLR.surface, transition: 'background .12s' }}
                      onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = '#dbeafe' }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelf ? '#fffbeb' : i % 2 === 0 ? CLR.white : CLR.surface }}>
                      <td style={{ padding: '14px 18px', color: CLR.border, fontSize: '.85rem', fontWeight: 700 }}>{u.id}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: u.role === 'hr' ? '#ede9fe' : CLR.accentLt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', fontWeight: 800, flexShrink: 0, color: u.role === 'hr' ? '#5b21b6' : CLR.accentDk }}>
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '.95rem', color: CLR.ink }}>
                              {u.full_name}
                              {isSelf && <span style={{ marginLeft: 7, fontSize: '.72rem', fontWeight: 800, background: '#fef3c7', color: CLR.amber, border: '1.5px solid #fde68a', borderRadius: 4, padding: '1px 6px' }}>You</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.9rem', color: CLR.slate, fontWeight: 500 }}><Mail size={12} color={CLR.border} />{u.email}</div>
                      </td>
                      <td style={{ padding: '14px 18px' }}><RoleBadge role={u.role} /></td>
                      <td style={{ padding: '14px 18px', fontSize: '.88rem', color: CLR.muted, fontWeight: 600 }}>{fmt(u.created_at)}</td>
                      <td style={{ padding: '14px 18px' }}>
                        {isSelf ? (
                          <span style={{ fontSize: '.82rem', color: CLR.border, fontStyle: 'italic' }}>(current account)</span>
                        ) : (
                          <button onClick={() => setDeleteTarget(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 4, background: CLR.redLt, border: '1.5px solid rgba(185,28,28,.25)', color: CLR.red, fontSize: '.82rem', fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = CLR.red; e.currentTarget.style.color = '#fff' }}
                            onMouseLeave={e => { e.currentTarget.style.background = CLR.redLt; e.currentTarget.style.color = CLR.red }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/* ═══════════════════════════════════════
   ── Main HR Dashboard ──
   ═══════════════════════════════════════ */
export default function HRDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [mainTab, setMainTab] = useState('candidates')

  const [candidates,         setCandidates]         = useState([])
  const [jobs,               setJobs]               = useState([])
  const [selectedJob,        setSelectedJob]        = useState(null)
  const [filterDecision,     setFilterDecision]     = useState('all')
  const [loading,            setLoading]            = useState(true)
  const [bulkLoading,        setBulkLoading]        = useState(false)
  const [bulkJobTitle,       setBulkJobTitle]       = useState('')
  const [bulkStatusData,     setBulkStatusData]     = useState(null)
  const [expandedRow,        setExpandedRow]        = useState(null)
  const [deleteTarget,       setDeleteTarget]       = useState(null)
  const [isDeleting,         setIsDeleting]         = useState(false)
  const [viewingProfileFor,  setViewingProfileFor]  = useState(null)
  const [downloadingDocId,   setDownloadingDocId]   = useState(null)

  const shortlistingRef = useRef(false)
  const selectedJobRef  = useRef(null)
  const pollIntervalRef = useRef(null)
  const pollActiveRef   = useRef(false)

  useEffect(() => { selectedJobRef.current = selectedJob }, [selectedJob])

  useEffect(() => {
    return () => {
      pollActiveRef.current = false
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [])

  const stopPolling = useCallback(() => {
    pollActiveRef.current = false
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, jRes] = await Promise.all([
        api.get('/hr/candidates'),
        api.get('/hr/jobs'),
      ])

      const allCandidates = cRes.data
      const seen  = new Set()
      const unique = jRes.data.filter(j => {
        if (seen.has(j.title)) return false
        seen.add(j.title)
        return true
      })

      setCandidates(allCandidates)
      setJobs(unique)

      if (!selectedJobRef.current && unique.length > 0) {
        const first =
          unique.find(j => allCandidates.some(c => c.job_title === j.title)) ||
          unique[0]
        setSelectedJob(first)
      }
    } catch {
      toast.error('Failed to load dashboard data')
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
        if (selectedJobRef.current?.id === deleteTarget.id) {
          setSelectedJob(remaining.length > 0 ? remaining[0] : null)
        }
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

    setBulkJobTitle(jobTitle)
    setBulkStatusData(null)
    setBulkLoading(true)
    stopPolling()

    try {
      const { data: startData } = await api.post(`/hr/shortlist-all/${jobId}`)

      if (!startData.processing) {
        // ✅ FIX APP-1: Backend now returns "already processed" message clearly
        toast.success(
          startData.message || `No pending candidates to process for "${jobTitle}".`,
          { duration: 6000 }
        )
        await fetchData()
        shortlistingRef.current = false
        setBulkLoading(false)
        setBulkJobTitle('')
        setBulkStatusData(null)
        return
      }

      const startedAt = Date.now()
      pollActiveRef.current = true

      pollIntervalRef.current = setInterval(async () => {
        if (!pollActiveRef.current) {
          stopPolling()
          return
        }

        if (Date.now() - startedAt > POLL_MAX_WAIT_MS) {
          stopPolling()
          toast.error('Shortlisting is taking too long — please refresh the page to see results.', { duration: 10_000 })
          shortlistingRef.current = false
          setBulkLoading(false)
          setBulkJobTitle('')
          setBulkStatusData(null)
          await fetchData()
          return
        }

        try {
          const { data: status } = await api.get(`/hr/shortlist-status/${jobId}`)

          if (!pollActiveRef.current) return

          setBulkStatusData(status)

          if (!status.processing) {
            stopPolling()

            const processed        = status.total         ?? 0
            const shortlistedCount = status.shortlisted   ?? 0
            const rejectedCount    = status.not_shortlisted ?? 0
            const errorCount       = status.errors        ?? 0

            await fetchData()

            if (errorCount > 0) {
              toast.success(
                `Processed ${processed} — ${shortlistedCount} shortlisted, ${rejectedCount} rejected, ${errorCount} timed out (HR review needed)`,
                { duration: 8000 }
              )
            } else {
              toast.success(
                `Processed ${processed} — ${shortlistedCount} shortlisted, ${rejectedCount} rejected`,
                { duration: 6000 }
              )
            }

            shortlistingRef.current = false
            setBulkLoading(false)
            setBulkJobTitle('')
            setBulkStatusData(null)
          }
        } catch (pollErr) {
          console.warn('[poll] Status check failed:', pollErr?.message)
        }
      }, POLL_INTERVAL_MS)

    } catch (err) {
      stopPolling()
      const isTimeout = !err.response
      const detail    = err.response?.data?.detail
      if (isTimeout) {
        toast.error('The shortlisting request timed out. Try shortlisting applicants one at a time.', { duration: 10_000 })
      } else {
        toast.error(detail || 'Automated shortlisting failed', { duration: 8000 })
      }
      shortlistingRef.current = false
      setBulkLoading(false)
      setBulkJobTitle('')
      setBulkStatusData(null)
    }
  }, [fetchData, stopPolling])

  // ✅ Table-level download helper
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
  const jobShortlisted = jobCandidates.filter(c => c.decision === 'shortlisted').length
  const jobRejected    = jobCandidates.filter(c => c.decision === 'not_shortlisted').length
  const jobUnprocessed = jobCandidates.filter(c => c.decision === 'pending').length

  const shortlistedRanked = rankedCandidates.filter(c => c.decision === 'shortlisted').map((c, i) => ({ id: c.application_id, rank: i + 1 }))
  const rankMap = Object.fromEntries(shortlistedRanked.map(r => [r.id, r.rank]))

  const getIdentityMatch = c => {
    if (!c.doc_verified) return false
    try { const p = JSON.parse(c.ai_reason || '{}'); return !((p.criteria_failed || []).join(' ').toLowerCase().includes('identity')) } catch { return c.doc_verified }
  }

  const expiredJobsCount = jobs.filter(j => isDeadlineExpired(j.deadline)).length

  return (
    <>
      <Helmet><title>HR Dashboard — Shortlisting AI</title></Helmet>

      {bulkLoading && <ProcessingOverlay jobTitle={bulkJobTitle} statusData={bulkStatusData} />}
      {deleteTarget && mainTab === 'candidates' && (
        <DeleteJobModal job={deleteTarget} onConfirm={handleDeleteJob} onCancel={() => setDeleteTarget(null)} isDeleting={isDeleting} />
      )}
      {viewingProfileFor && <CandidateProfileModal candidate={viewingProfileFor} onClose={() => setViewingProfileFor(null)} />}

      <div className="page-wrapper">
        <Navbar />
        <div className="container" style={{ padding: '48px 28px 80px' }}>

          {/* ── Header ── */}
          <div className="fade-up" style={{ marginBottom: 36 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: CLR.accent, marginBottom: 8 }}>HR Portal</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: CLR.ink }}>HR Dashboard</h1>
                <div style={{ width: 44, height: 4, background: `linear-gradient(90deg, ${CLR.accent}, ${CLR.teal})`, marginTop: 10, borderRadius: 2 }} />
                <p style={{ color: CLR.muted, marginTop: 10, fontSize: '1rem', fontWeight: 500 }}>
                  Welcome, {user?.fullName || user?.full_name}. Manage candidates, positions, and system accounts below.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline btn-sm" onClick={fetchData}><RefreshCw size={13} /> Refresh</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/hr/jobs/new')}>+ Post Position</button>
              </div>
            </div>
          </div>

          {/* ── Main tab switcher ── */}
          <div className="fade-up fade-up-1" style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 28 }}>
            {[
              { key: 'candidates', label: 'Candidates & Jobs', icon: <Users size={15} /> },
              { key: 'users',      label: 'Manage Accounts',   icon: <UserCog size={15} /> },
              { key: 'logs',       label: 'System Logs',       icon: <ScrollText size={15} /> },
            ].map(tab => (
              <button key={tab.key} onClick={() => setMainTab(tab.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 24px', border: 'none', borderBottom: mainTab === tab.key ? `3px solid ${CLR.accent}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: mainTab === tab.key ? 800 : 600, fontSize: '.95rem', color: mainTab === tab.key ? CLR.accent : CLR.muted, transition: 'all .15s', marginBottom: -2 }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ══ CANDIDATES TAB ══ */}
          {mainTab === 'candidates' && (
            <>
              <div className="fade-up fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 16, marginBottom: 32 }}>
                {[
                  { label: 'Total Applicants', value: total,       icon: <Users size={17} />,       color: CLR.ink,   bg: CLR.surface, border: '#e5e7eb' },
                  { label: 'Shortlisted',      value: shortlisted, icon: <CheckCircle size={17} />, color: CLR.green, bg: CLR.greenLt, border: 'rgba(21,128,61,.25)' },
                  { label: 'Not Shortlisted',  value: rejected,    icon: <XCircle size={17} />,     color: CLR.red,   bg: CLR.redLt,   border: 'rgba(185,28,28,.2)' },
                  ...(unprocessed > 0 ? [{ label: 'Awaiting AI', value: unprocessed, icon: <Bot size={17} />, color: CLR.amber, bg: CLR.amberLt, border: 'rgba(146,64,14,.2)' }] : []),
                  ...(expiredJobsCount > 0 ? [{ label: 'Expired Positions', value: expiredJobsCount, icon: <Clock size={17} />, color: CLR.muted, bg: CLR.surface, border: '#d1d5db' }] : []),
                ].map(({ label, value, icon, color, bg, border }) => (
                  <div key={label} style={{ background: bg, border: `2px solid ${border}`, borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 6px rgba(10,15,40,.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color, marginBottom: 10 }}>
                      {icon}
                      <span style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>

              {jobs.length > 0 && (
                <div className="fade-up fade-up-2" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid #e5e7eb', marginBottom: 0 }}>
                  {jobs.map(job => {
                    const count    = applicantCountByTitle[job.title] || 0
                    const isActive = selectedJob?.id === job.id
                    const expired  = isDeadlineExpired(job.deadline)
                    return (
                      <button key={job.id} onClick={() => { setSelectedJob(job); setFilterDecision('all'); setExpandedRow(null) }} style={{ padding: '10px 20px', border: 'none', borderBottom: isActive ? `3px solid ${CLR.accent}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: isActive ? 800 : 600, fontSize: '.95rem', color: isActive ? CLR.accent : expired ? CLR.border : CLR.muted, display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s', marginBottom: -2 }}>
                        {job.title}
                        {expired && <span style={{ fontSize: '.68rem', fontWeight: 800, background: CLR.redLt, color: '#7f1d1d', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 6px' }}>Expired</span>}
                        {count > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', background: isActive ? CLR.accent : '#e5e7eb', color: isActive ? '#fff' : CLR.slate, borderRadius: 4, fontSize: '.72rem', fontWeight: 800 }}>{count}</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedJob && (
                <div className="card fade-up fade-up-3" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '22px 26px', borderTop: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: CLR.ink }}>{selectedJob.title}</h2>
                        {isDeadlineExpired(selectedJob.deadline) && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.75rem', fontWeight: 800, background: CLR.redLt, color: '#7f1d1d', border: '1.5px solid #fca5a5', borderRadius: 4, padding: '2px 9px' }}>
                            <AlertCircle size={10} /> Deadline Passed — Hidden from Applicants
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: '.9rem' }}>
                        <span style={{ color: CLR.green, fontWeight: 700 }}>✓ {jobShortlisted} shortlisted</span>
                        <span style={{ color: CLR.red, fontWeight: 700 }}>✗ {jobRejected} rejected</span>
                        {jobUnprocessed > 0 && <span style={{ color: CLR.amber, fontWeight: 700 }}>⚡ {jobUnprocessed} awaiting evaluation</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/hr/report/${selectedJob.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BarChart2 size={13} /> View Report
                      </button>
                      <button
                        className="btn btn-accent btn-sm"
                        onClick={() => automateShortlist(selectedJob.id, selectedJob.title)}
                        disabled={bulkLoading || shortlistingRef.current || jobCandidates.length === 0}
                        style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                      >
                        <Bot size={14} /> Automate Shortlisting
                        {jobUnprocessed > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 5px', background: 'rgba(0,0,0,0.18)', color: '#fff', borderRadius: 4, fontSize: '.7rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{jobUnprocessed}</span>}
                      </button>
                      <button onClick={() => setDeleteTarget(selectedJob)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 4, background: CLR.redLt, border: '1.5px solid rgba(185,28,28,.25)', color: CLR.red, fontSize: '.9rem', fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = CLR.red; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = CLR.redLt; e.currentTarget.style.color = CLR.red }}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="form-select" style={{ width: 'auto', minWidth: 170, color: CLR.ink }} value={filterDecision} onChange={e => { setFilterDecision(e.target.value); setExpandedRow(null) }}>
                      <option value="all">All Decisions</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="not_shortlisted">Not Shortlisted</option>
                    </select>
                    <span style={{ fontSize: '.92rem', color: CLR.muted, fontWeight: 600 }}>{filtered.length} of {jobCandidates.length} candidates</span>
                    {filtered.length > 0 && filterDecision !== 'not_shortlisted' && (
                      <span style={{ fontSize: '.78rem', color: CLR.green, background: CLR.greenLt, padding: '4px 11px', borderRadius: 4, border: '1.5px solid rgba(21,128,61,.25)', letterSpacing: '.04em', fontWeight: 700 }}>
                        Ranked by AI score
                      </span>
                    )}
                  </div>

                  {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 36, height: 36 }} /></div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: CLR.ink }}>No candidates found</h3>
                      <p style={{ fontSize: '.95rem', color: CLR.muted }}>{jobCandidates.length === 0 ? 'No applications for this position yet.' : 'Try adjusting the filter.'}</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb', background: CLR.surface }}>
                            {['Rank', 'Name', 'Education', 'Experience', 'Decision', 'AI Score', 'Documents', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontWeight: 800, fontSize: '.75rem', color: CLR.slate, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((c, i) => (
                            <React.Fragment key={c.application_id}>
                              <tr
                                style={{ borderBottom: expandedRow === c.application_id ? 'none' : '1px solid #e5e7eb', background: i % 2 === 0 ? CLR.white : CLR.surface, transition: 'background .15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                                onMouseLeave={e => e.currentTarget.style.background = expandedRow === c.application_id ? '#dbeafe' : i % 2 === 0 ? CLR.white : CLR.surface}
                              >
                                <td style={{ padding: '15px 18px' }}>
                                  {c.decision === 'shortlisted'
                                    ? <RankBadge rank={rankMap[c.application_id]} decision={c.decision} />
                                    : <span style={{ color: CLR.border, fontSize: '.9rem', fontWeight: 700 }}>—</span>}
                                </td>
                                <td style={{ padding: '15px 18px' }}>
                                  <div style={{ fontWeight: 700, fontSize: '1rem', color: CLR.ink }}>{c.full_name}</div>
                                  <div style={{ fontSize: '.82rem', color: CLR.muted, fontWeight: 500 }}>{c.email}</div>
                                  {c.phone && <div style={{ fontSize: '.78rem', color: CLR.border, display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}><Phone size={10} />{c.phone}</div>}
                                </td>
                                <td style={{ padding: '15px 18px' }}>
                                  <div style={{ fontSize: '.95rem', color: CLR.ink, fontWeight: 600 }}>{c.education_level}</div>
                                  <div style={{ fontSize: '.82rem', color: CLR.muted }}>{c.field_of_study}</div>
                                </td>
                                <td style={{ padding: '15px 18px', fontSize: '.95rem', color: CLR.slate, fontWeight: 600 }}>{c.experience_years} yrs</td>
                                <td style={{ padding: '15px 18px' }}><DecisionBadge decision={c.decision} /></td>
                                <td style={{ padding: '15px 18px' }}>
                                  {c.ai_score != null ? (
                                    <span style={{ fontWeight: 800, fontSize: '1rem', color: c.ai_score >= PASS_THRESHOLD ? CLR.green : CLR.red }}>
                                      {(c.ai_score * 100).toFixed(1)}%
                                    </span>
                                  ) : <span style={{ color: CLR.border, fontSize: '.9rem', fontWeight: 600 }}>—</span>}
                                </td>
                                {/* ✅ Documents column with Download buttons */}
                                <td style={{ padding: '15px 18px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {c.doc_verified ? (
                                      <span style={{ color: CLR.green, fontSize: '.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><ShieldCheck size={13} /> Verified</span>
                                    ) : (
                                      <span style={{ color: CLR.teal, fontSize: '.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Bot size={12} /> AI verified</span>
                                    )}
                                    {/* Quick download links for each document */}
                                    {(c.documents || []).slice(0, 3).map(doc => (
                                      <button
                                        key={doc.id}
                                        onClick={() => handleTableDownload(doc)}
                                        disabled={downloadingDocId === doc.id}
                                        title={`Download ${doc.original_name || doc.doc_type}`}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 4,
                                          padding: '3px 8px', borderRadius: 4,
                                          background: CLR.accentLt,
                                          border: `1px solid ${CLR.accent}`,
                                          color: CLR.accentDk,
                                          fontSize: '.7rem', fontWeight: 700,
                                          cursor: downloadingDocId === doc.id ? 'wait' : 'pointer',
                                          maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}
                                      >
                                        <Download size={10} />
                                        {downloadingDocId === doc.id ? '…' : (DOC_TYPE_ICONS[doc.doc_type] || '') + ' ' + (doc.doc_type || 'doc')}
                                      </button>
                                    ))}
                                    {(c.documents || []).length > 3 && (
                                      <span style={{ fontSize: '.7rem', color: CLR.muted, fontWeight: 600 }}>+{c.documents.length - 3} more (Full Profile)</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '15px 18px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <button
                                      onClick={() => setViewingProfileFor(c)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 4, background: '#eff6ff', border: `1.5px solid ${CLR.accentLt}`, color: CLR.accentDk, fontSize: '.8rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                      <User size={12} /> Full Profile
                                    </button>
                                    {c.ai_reason && (
                                      <button
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: CLR.muted, fontSize: '.8rem', fontWeight: 700, padding: 0 }}
                                        onClick={() => setExpandedRow(expandedRow === c.application_id ? null : c.application_id)}
                                      >
                                        {expandedRow === c.application_id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        {expandedRow === c.application_id ? 'Hide AI' : 'AI Reason'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {expandedRow === c.application_id && (
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <td colSpan={8} style={{ padding: '0 18px 18px', background: '#dbeafe' }}>
                                    <div style={{ padding: '18px 22px', background: CLR.white, borderRadius: 8, border: '1.5px solid #e5e7eb' }}>
                                      <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: CLR.ink }}>
                                        <Bot size={15} color={CLR.accent} />
                                        AI Decision Breakdown — {c.full_name}
                                        {c.decision === 'shortlisted' && rankMap[c.application_id] && (
                                          <span style={{ fontSize: '.85rem', color: CLR.muted, marginLeft: 4 }}>· Rank #{rankMap[c.application_id]}</span>
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
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 10, color: CLR.ink }}>No positions posted yet</h3>
                  <p style={{ color: CLR.muted, marginBottom: 26, fontSize: '.95rem' }}>Create your first job posting to start receiving and shortlisting applicants.</p>
                  <button className="btn btn-primary" onClick={() => navigate('/hr/jobs/new')}>+ Post First Position</button>
                </div>
              )}
            </>
          )}

          {/* ══ USERS TAB ══ */}
          {mainTab === 'users' && (
            <div className="fade-up">
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: CLR.ink, marginBottom: 4 }}>System Account Management</h2>
                <p style={{ fontSize: '.95rem', color: CLR.muted }}>View all registered accounts, create new users of any role, or permanently remove accounts.</p>
              </div>
              <UsersTab currentUserId={user?.userId ? Number(user.userId) : null} />
            </div>
          )}

          {/* ══ SYSTEM LOGS TAB ══ */}
          {mainTab === 'logs' && (
            <div className="fade-up">
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: CLR.ink, marginBottom: 4 }}>System Logs</h2>
                <p style={{ fontSize: '.95rem', color: CLR.muted }}>Audit trail of all HR actions, AI shortlisting events, and account changes.</p>
              </div>
              <SystemLogs />
            </div>
          )}

        </div>
      </div>
    </>
  )
}
