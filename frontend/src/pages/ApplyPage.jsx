/**
 * ApplyPage.jsx — v9.3.0 (USER-FRIENDLY MESSAGES)
 *
 * CHANGES FROM v9.2.0:
 *  - IdentityRejectionCard: replaced raw backend message with clear, friendly
 *    step-by-step guidance. Removed technical jargon.
 *  - Toast messages: shorter, warmer, actionable.
 *  - QualityRejectionCard: friendlier heading and tips.
 *  - Upload status messages: plain English ("Uploading your document…" etc.)
 *  - Error states: plain English labels and helper text.
 *  - All existing logic preserved — only user-visible strings changed.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Upload, CheckCircle, XCircle, AlertCircle,
  Loader, ArrowRight, ArrowLeft, ShieldCheck, Info, RefreshCw, User,
  Eye, Camera, ZoomIn, ExternalLink, ShieldX, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api, {
  BACKEND,
  getServerStatus,
  onServerStatusChange,
  waitForUploadSlot,
  releaseUploadSlot,
  getCurrentWakeGate,
} from '../api/axios'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  {
    key:         'id_card',
    label:       'National ID / Passport',
    description: 'Official government-issued ID. Your name on the ID must match your account name exactly.',
    required:    true,
    tips:        'Place on a flat surface with good lighting. Ensure all 4 corners are visible.',
    qualityTips: [
      'Ensure the entire ID is flat, fully in-frame, and all 4 corners are visible',
      'Good even lighting — no shadows over the name or ID number',
      'Hold the camera directly above — not at an angle',
      'Tap to focus before shooting',
    ],
  },
  {
    key:         'cv',
    label:       'CV / Resume',
    description: 'Your own curriculum vitae or resume. Your name must appear clearly at the top — uploading someone else\'s CV will be rejected.',
    required:    true,
    tips:        'PDF format preferred. Ensure text is clear and not cut off.',
    qualityTips: [
      'PDF is strongly preferred for CVs',
      'Ensure the file is not password-protected',
      'All pages should be present in one file',
    ],
  },
  {
    key:         'diploma',
    label:       'Academic Diploma / Degree',
    icon:        '🎓',
    description: 'Your own highest academic qualification. Your name, field of study, and education level will all be verified.',
    required:    true,
    tips:        'Scan or photograph in good light. All text must be legible.',
    qualityTips: [
      'Ensure the institution name, your name, and degree title are all visible',
      'Avoid folding — place flat on a dark surface',
      'Use a scanner app (Adobe Scan, Microsoft Lens) for best results',
    ],
  },
  {
    key:         'certificate',
    label:       'Professional Certificate',
    description: 'Any professional certification relevant to the role. Your name on the certificate will be verified. Optional.',
    required:    false,
    tips:        'Upload a clear scan. PDF or high-resolution image.',
    qualityTips: [
      'Ensure the certificate title and your name are clearly visible',
      'Include the full certificate — not just a cropped section',
    ],
  },
  {
    key:         'experience',
    label:       'Experience Document',
    description: 'Employment letter, reference letter, or work certificate. Must be on official letterhead and include your name. Optional.',
    required:    false,
    tips:        'Must be on official letterhead with a signature and your name clearly visible.',
    qualityTips: [
      'Must show official letterhead with organisation name',
      'Your name and position must be clearly stated in the letter body',
      'Include the signature block at the bottom',
    ],
  },
]

const REQUIRED_DOC_KEYS  = DOC_TYPES.filter(d => d.required).map(d => d.key)
const STEPS              = ['Position Info', 'Your Details', 'Documents', 'Submit']

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg']
const MAX_FILE_SIZE_MB   = 5
const MAX_FILE_SIZE_B    = MAX_FILE_SIZE_MB * 1024 * 1024

const STEP_COLORS = {
  done:    { bg: '#2563eb', color: '#ffffff', border: '#2563eb' },
  active:  { bg: '#ffffff', color: '#2563eb', border: '#2563eb' },
  pending: { bg: '#ffffff', color: '#9ca3af', border: '#d1d5db' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

const makeDocState = () =>
  Object.fromEntries(DOC_TYPES.map(d => [
    d.key,
    {
      status:              'idle',
      message:             '',
      fileName:            '',
      isAdvisory:          false,
      isNameAdvisory:      false,
      isNameMismatch:      false,
      isIdentityRejection: false,
      isNetwork:           false,
      isRejected:          false,
      fromProfile:         false,
      previewUrl:          null,
      pdfUrl:              null,
      isPdf:               false,
      qualityWarnings:     [],
    },
  ]))

const _IDENTITY_REJECTION_PHRASES = [
  'does not appear to belong to you',
  'this id card does not appear to belong',
  'this cv does not appear to belong',
  'this diploma does not appear to belong',
  'could not be found in this document',
  'not found in this document',
  'upload your own',
  'uploading your own',
  'belongs to you',
  'your own cv',
  'your own id',
  'your own diploma',
  'your own academic certificate',
  'identity verification failed',
  'your name could not be found',
  'name mismatch',
  'field mismatch',
  'field of study mismatch',
  'education level mismatch',
]

function _isIdentityRejection(msg) {
  if (!msg) return false
  const lower = msg.toLowerCase()
  if (msg.trimStart().startsWith('✓')) return false
  return _IDENTITY_REJECTION_PHRASES.some(phrase => lower.includes(phrase))
}

function extractErrorDetail(err) {
  if (!err.response) return {
    message: 'Could not reach the server. Please check your connection and try again.',
    isNetwork: true,
    isRejected: false,
    isIdentityRejection: false,
    isNotFound: false,
  }
  const data   = err.response?.data
  const status = err.response?.status
  const isRejected  = status === 422
  const isNotFound  = status === 404
  let message = ''
  if (!data)                                message = `Something went wrong (error ${status}). Please try again.`
  else if (typeof data.detail === 'string') message = data.detail
  else if (Array.isArray(data.detail))      message = data.detail.map(e => e.msg || JSON.stringify(e)).join(' · ')
  else if (typeof data === 'string')        message = data
  else                                      message = 'Upload failed. Please try again.'
  const isIdentityRejection = isRejected && _isIdentityRejection(message)
  return { message, isNetwork: false, isRejected, isIdentityRejection, isNotFound }
}

const _ADVISORY_EXACT_PHRASES = [
  'your identity will be confirmed during the review process',
  'will be reviewed during the process',
  'received and will be reviewed',
]

function _isAdvisory(msg) {
  if (!msg) return false
  if (msg.trimStart().startsWith('✓')) return false
  const lower = msg.toLowerCase()
  return _ADVISORY_EXACT_PHRASES.some(phrase => lower.includes(phrase))
}

function _isSuccess(msg) {
  return !!(msg && msg.trimStart().startsWith('✓'))
}

function _isNameMismatch(msg) {
  if (!msg) return false
  if (!msg.trimStart().startsWith('✓')) return false
  const lower = msg.toLowerCase()
  return lower.includes('name match score') && lower.includes('acceptable range')
}

const _NAME_ADVISORY_PHRASES = [
  'could not be confirmed automatically',
  'hr may request additional verification',
  'ensure this certificate belongs to you',
  'ensure this document was issued in your name',
  'name could not be verified automatically',
]

function _isNameAdvisory(msg) {
  if (!msg) return false
  if (!msg.trimStart().startsWith('✓')) return false
  const lower = msg.toLowerCase()
  return _NAME_ADVISORY_PHRASES.some(phrase => lower.includes(phrase))
}

const ADVISORY_USER_MESSAGE =
  'Your document has been received. Your identity will be confirmed during the review process.'

const QUALITY_REJECT_TIPS = [
  'Place the document flat on a dark surface',
  'Use good, even lighting — avoid shadows or glare',
  'Hold your camera steady and close to the document',
  'Ensure all four corners of the document are visible',
  'Try scanning with a scanner app (Adobe Scan, Microsoft Lens) for best results',
]

const _blankDocState = {
  status: 'idle', message: '', fileName: '',
  isAdvisory: false, isNameAdvisory: false, isNameMismatch: false,
  isIdentityRejection: false, isNetwork: false, isRejected: false,
  fromProfile: false, previewUrl: null, pdfUrl: null, isPdf: false,
  qualityWarnings: [],
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-upload quality check
// ─────────────────────────────────────────────────────────────────────────────

async function checkDocumentQuality(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') {
    return { ok: true, hardReject: false, reason: '', warnings: [] }
  }
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post('/ocr/quality', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 8000,
    })
    return {
      ok:         !data.hard_reject,
      hardReject: !!data.hard_reject,
      reason:     data.hard_reject_reason || '',
      warnings:   data.warnings || [],
      blurScore:  data.blur_score || 999,
      isDark:     data.is_dark || false,
    }
  } catch (err) {
    console.warn('[ApplyPage] /ocr/quality check failed — proceeding:', err?.message)
    return { ok: true, hardReject: false, reason: '', warnings: [] }
  }
}

function createPreviewUrl(file) {
  if (!file) return null
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return null
  try { return URL.createObjectURL(file) } catch { return null }
}

function createPdfUrl(file) {
  if (!file) return null
  try { return URL.createObjectURL(file) } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36, overflowX: 'auto', paddingBottom: 4 }}>
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'pending'
        const { bg, color, border } = STEP_COLORS[state]
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: bg, border: `2px solid ${border}`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.75rem', fontWeight: 700, flexShrink: 0,
              }}>
                {i < current ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '.85rem', fontWeight: i === current ? 700 : 500,
                color: i === current ? '#111827' : '#9ca3af', whiteSpace: 'nowrap',
              }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 32, height: 2,
                background: i < current ? '#2563eb' : '#e5e7eb',
                margin: '0 10px', flexShrink: 0,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function WakeBanner({ status, queuedCount }) {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    if (status === 'awake') return
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 600)
    return () => clearInterval(t)
  }, [status])
  if (status === 'awake' && queuedCount === 0) return null
  if (status === 'awake' && queuedCount > 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 16, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: '.85rem', color: '#1e40af', fontWeight: 600 }}>
        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        Server is ready — uploading {queuedCount} queued file{queuedCount > 1 ? 's' : ''} now…
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: '.85rem', color: '#78350f', fontWeight: 600 }}>
      <Loader size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      Server is starting up{queuedCount > 0
        ? ` — ${queuedCount} file${queuedCount > 1 ? 's' : ''} queued, will upload automatically`
        : ' — uploads will begin automatically when ready'}{dots}
    </div>
  )
}

function DocPreview({ previewUrl, isPdf, fileName, pdfUrl }) {
  const [enlarged, setEnlarged] = useState(false)
  if (!previewUrl && !isPdf) return null
  if (isPdf) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: '.78rem', color: '#374151', fontWeight: 600 }}>
          {fileName}
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: '#eff6ff', border: '1px solid #93c5fd', fontSize: '.78rem', color: '#1d4ed8', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
            <ExternalLink size={11} /> Preview PDF
          </a>
        )}
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img src={previewUrl} alt="Document preview" onClick={() => setEnlarged(true)} style={{ height: 80, maxWidth: 180, objectFit: 'cover', borderRadius: 6, border: '1.5px solid #d1d5db', cursor: 'zoom-in', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '.65rem', color: '#fff', fontWeight: 600 }}>
          <ZoomIn size={9} /> Preview
        </div>
      </div>
      {enlarged && (
        <div onClick={() => setEnlarged(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={previewUrl} alt="Document enlarged" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', top: 20, right: 28, color: '#fff', fontSize: '1.6rem', fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>✕</div>
          <div style={{ position: 'absolute', bottom: 20, color: 'rgba(255,255,255,0.6)', fontSize: '.8rem' }}>Click anywhere to close</div>
        </div>
      )}
    </div>
  )
}

function QualityRejectionCard({ reason, docTips, extraTips }) {
  const cleanReason = (reason || '')
    .replace(/sharpness score: [\d.]+/gi, '')
    .replace(/brightness: [\d.]+\/255/gi, '')
    .replace(/\(score: [\d.]+\)/gi, '')
    .replace(/\(\d+ of \d+ minimum readable characters detected\)/gi, '')
    .trim()

  // Convert technical reasons to plain English
  const friendlyReason = cleanReason
    ? cleanReason
        .replace(/hard_reject/gi, '')
        .replace(/ocr/gi, 'text reading')
        .replace(/threshold/gi, 'minimum quality')
        .trim()
    : ''

  const allTips = [...(docTips ? [docTips] : []), ...(extraTips || []), ...QUALITY_REJECT_TIPS.slice(0, extraTips?.length ? 2 : 3)]
  return (
    <div style={{ padding: '14px 16px', borderRadius: 8, background: '#fef2f2', border: '1.5px solid #fca5a5', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#991b1b', fontSize: '.85rem', marginBottom: 8 }}>
        <Camera size={14} /> We couldn't read this document — please upload a clearer version
      </div>
      {friendlyReason && (
        <div style={{ fontSize: '.78rem', color: '#7f1d1d', marginBottom: 10, paddingLeft: 21, lineHeight: 1.6 }}>
          {friendlyReason}
        </div>
      )}
      <div style={{ fontSize: '.78rem', color: '#7f1d1d', fontWeight: 700, marginBottom: 6, paddingLeft: 21 }}>How to get a better scan:</div>
      <ul style={{ margin: 0, paddingLeft: 38, color: '#991b1b', fontSize: '.75rem', lineHeight: 1.9 }}>
        {allTips.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  )
}

// FIXED: IdentityRejectionCard — friendly, actionable, no raw backend text
function IdentityRejectionCard({ docType, accountName }) {
  const docDef   = DOC_TYPES.find(d => d.key === docType)
  const docLabel = docDef?.label || 'document'

  return (
    <div style={{ padding: '16px 18px', borderRadius: 8, background: '#fef2f2', border: '2px solid #dc2626', marginBottom: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#7f1d1d', fontSize: '.9rem', marginBottom: 12 }}>
        <ShieldX size={16} color="#dc2626" />
        We couldn't confirm this {docLabel.toLowerCase()} belongs to you
      </div>

      {/* Explanation */}
      <div style={{ fontSize: '.83rem', color: '#7f1d1d', lineHeight: 1.75, marginBottom: 14, paddingLeft: 24 }}>
        Our system checks that your name appears clearly on every document you upload.
        We weren't able to find <strong>{accountName}</strong> on this {docLabel.toLowerCase()}.
      </div>

      {/* Account name box */}
      <div style={{ paddingLeft: 24, marginBottom: 14 }}>
        <div style={{ fontSize: '.78rem', color: '#991b1b', fontWeight: 700, marginBottom: 5 }}>
          Your account name (must appear on the document):
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff1f2', border: '1.5px solid #fca5a5', borderRadius: 6, padding: '6px 14px' }}>
          <User size={13} color="#dc2626" />
          <span style={{ fontSize: '.9rem', color: '#7f1d1d', fontWeight: 700 }}>{accountName}</span>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ paddingLeft: 24, marginBottom: 12 }}>
        <div style={{ fontSize: '.78rem', color: '#991b1b', fontWeight: 700, marginBottom: 6 }}>Please check the following:</div>
        <ul style={{ margin: 0, paddingLeft: 16, color: '#991b1b', fontSize: '.78rem', lineHeight: 2 }}>
          <li>Is this your own {docLabel.toLowerCase()}? Only upload documents with your name on them.</li>
          <li>Is your name clearly visible? Try re-scanning with better lighting.</li>
          <li>Is the correct side showing? Make sure the name side is facing the camera.</li>
          <li>Is the scan blurry or cut off? Upload a sharper, full-page version.</li>
        </ul>
      </div>

      {/* Call to action */}
      <div style={{ paddingLeft: 24, padding: '10px 14px', background: '#fff1f2', borderRadius: 6, fontSize: '.8rem', color: '#991b1b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
        <FileText size={14} color="#dc2626" />
        <span>Use the button below to upload <strong>your own</strong> {docLabel.toLowerCase()} that clearly shows your name.</span>
      </div>
    </div>
  )
}

function QualityWarningCard({ warnings }) {
  if (!warnings?.length) return null
  return (
    <div style={{ padding: '10px 14px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: 10, fontSize: '.78rem', color: '#78350f', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
        <AlertCircle size={12} /> Image quality notice
      </div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {warnings.map((w, i) => (
          <li key={i}>{w.replace(/sharpness: [\d.]+\/100/gi, '').replace(/score: [\d.]+\/100/gi, '').trim()}</li>
        ))}
      </ul>
      <div style={{ marginTop: 6, fontWeight: 600 }}>
        You can continue with this file, or upload a clearer version for best results.
      </div>
    </div>
  )
}

function NameAdvisoryCard({ message, docType }) {
  const docLabel = DOC_TYPES.find(d => d.key === docType)?.label || docType
  return (
    <div style={{ padding: '10px 14px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: 10, fontSize: '.78rem', color: '#78350f', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
        <AlertCircle size={12} /> Name verification notice
      </div>
      <div>{message}</div>
      <div style={{ marginTop: 6, fontWeight: 600 }}>
        A recruiter will review this {docLabel.toLowerCase()} manually before a final decision is made.
      </div>
    </div>
  )
}

function NameMismatchCard({ message }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: 10, fontSize: '.78rem', color: '#78350f', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
        <AlertCircle size={12} /> Name match notice
      </div>
      <div>{message}</div>
      <div style={{ marginTop: 6, fontWeight: 600 }}>
        Please make sure the name on this document exactly matches the name on your account.
      </div>
    </div>
  )
}

const fieldLabel = {
  display: 'block', fontSize: '.8rem', fontWeight: 700,
  color: '#374151', textTransform: 'uppercase',
  letterSpacing: '.05em', marginBottom: 7,
}

// ─────────────────────────────────────────────────────────────────────────────
// Already-applied screen
// ─────────────────────────────────────────────────────────────────────────────

function AlreadyAppliedScreen({ job, navigate }) {
  return (
    <div className="page-wrapper">
      <Helmet><title>Already Applied — {job?.title} | Shortlisting AI</title></Helmet>
      <Navbar />
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '40px 0 36px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dbeafe', border: '3px solid #2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <CheckCircle size={40} color="#2563eb" />
        </div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', marginBottom: 14 }}>You've Already Applied</h1>
        <div style={{ width: 44, height: 3, background: '#2563eb', borderRadius: 99, margin: '0 auto 20px' }} />
        <p style={{ color: '#6b7280', maxWidth: 480, lineHeight: 1.8, marginBottom: 30 }}>
          You have already submitted an application for <strong style={{ color: '#111827' }}>{job?.title}</strong>.
          Check your application status on the dashboard.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/jobs')} style={{ padding: '10px 22px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Browse More Positions</button>
          <button onClick={() => navigate('/applicant')} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>My Applications</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ApplyPage() {
  const { jobId } = useParams()
  const { user }  = useAuth()
  const navigate  = useNavigate()

  const [job,              setJob]              = useState(null)
  const [step,             setStep]             = useState(0)
  const [applicationId,    setApplicationId]    = useState(null)
  const [alreadyApplied,   setAlreadyApplied]   = useState(false)
  const [submitting,       setSubmitting]       = useState(false)
  const [submitted,        setSubmitted]        = useState(false)
  const [loadingJob,       setLoadingJob]       = useState(true)
  const [serverStatus,     setServerStatus]     = useState(getServerStatus)
  const [queuedCount,      setQueuedCount]      = useState(0)

  const [profileAvailable, setProfileAvailable] = useState({})
  const [attachingProfile, setAttachingProfile] = useState({})

  const applicationIdRef   = useRef(null)
  const submittedRef       = useRef(false)
  const uploadingRef       = useRef(new Set())
  const uploadedDocIds     = useRef({})
  const retryQueueRef      = useRef({})
  const mountedRef         = useRef(true)
  const submittingDraftRef = useRef(false)
  const handleUploadRef    = useRef(null)
  const previewUrlsRef     = useRef({})
  const pdfUrlsRef         = useRef({})

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      Object.values(previewUrlsRef.current).forEach(url => { if (url) try { URL.revokeObjectURL(url) } catch {} })
      Object.values(pdfUrlsRef.current).forEach(url => { if (url) try { URL.revokeObjectURL(url) } catch {} })
    }
  }, [])

  useEffect(() => { applicationIdRef.current = applicationId }, [applicationId])
  useEffect(() => { submittedRef.current     = submitted     }, [submitted])

  const syncQueuedCount = useCallback(() => {
    if (!mountedRef.current) return
    setQueuedCount(Object.keys(retryQueueRef.current).length)
  }, [])

  useEffect(() => {
    return onServerStatusChange(newStatus => {
      if (mountedRef.current) setServerStatus(newStatus)
      if (newStatus === 'awake') {
        const docTypes = Object.keys(retryQueueRef.current)
        if (docTypes.length === 0) return
        docTypes.forEach(async (docType, idx) => {
          await sleep(idx * 1200)
          const file = retryQueueRef.current[docType]
          if (!file) return
          let waited = 0
          while (!applicationIdRef.current && waited < 30_000) { await sleep(500); waited += 500 }
          if (!applicationIdRef.current) return
          if (retryQueueRef.current[docType] !== file) return
          delete retryQueueRef.current[docType]
          syncQueuedCount()
          handleUploadRef.current?.(docType, file, { _bypassUploadingGuard: true, _skipQualityCheck: true })
        })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [form, setForm] = useState({
    gender: '', education_level: '', field_of_study: '', graduation_year: '',
    experience_years: 0, skills: '', certifications: '',
    address: '', phone: '', date_of_birth: '',
  })
  const [formErrors, setFormErrors] = useState({})
  const [docStatus,  setDocStatus]  = useState(makeDocState)

  useEffect(() => {
    if (!user) return
    setForm(prev => ({
      ...prev,
      phone:   prev.phone   || user.phone   || '',
      address: prev.address || user.address || '',
    }))
  }, [user])

  useEffect(() => {
    if (!jobId) return
    api.get(`/jobs/${jobId}`)
      .then(res => { if (mountedRef.current) setJob(res.data) })
      .catch(() => toast.error('Job not found'))
      .finally(() => { if (mountedRef.current) setLoadingJob(false) })
  }, [jobId])

  useEffect(() => {
    api.get('/profile/documents')
      .then(({ data }) => {
        const docs = Array.isArray(data) ? data : (data.documents || [])
        if (!docs.length || !mountedRef.current) return
        const available = {}
        docs.forEach(doc => {
          if (doc.doc_type && doc.id) {
            available[doc.doc_type] = { id: doc.id, source: doc.source || 'profile', fileName: doc.original_name || doc.file_name || doc.doc_type }
          }
        })
        if (mountedRef.current) setProfileAvailable(available)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!applicationId) return
    api.get(`/applications/${applicationId}/documents`)
      .then(({ data }) => {
        const docs = data.documents || []
        if (docs.length === 0 || !mountedRef.current) return
        docs.forEach(doc => {
          if (!doc.doc_type) return
          uploadedDocIds.current[doc.doc_type] = doc.id
          const msg                = doc.validation_message || '✓ Document already uploaded.'
          const isAdvisory         = _isAdvisory(msg)
          const isNameAdvisory     = _isNameAdvisory(msg)
          const isNameMismatch     = _isNameMismatch(msg)
          const isIdentityRejection = _isIdentityRejection(msg)
          if (mountedRef.current) {
            setDocStatus(prev => {
              if (prev[doc.doc_type]?.status !== 'idle') return prev
              return {
                ...prev,
                [doc.doc_type]: {
                  status: 'success', message: msg,
                  fileName: doc.original_name || doc.doc_type,
                  isAdvisory, isNameAdvisory, isNameMismatch, isIdentityRejection,
                  isNetwork: false, isRejected: false, fromProfile: false,
                  previewUrl: null, pdfUrl: null, isPdf: false, qualityWarnings: [],
                },
              }
            })
          }
        })
      })
      .catch(err => {
        const status = err?.response?.status
        if (status === 404 || status === 422) {
          console.warn(`[ApplyPage] GET /applications/${applicationId}/documents → ${status} (application not ready yet, ignoring)`)
        } else {
          console.warn('[ApplyPage] Could not restore existing documents:', err?.message)
        }
      })
  }, [applicationId])

  useEffect(() => {
    return () => {
      if (applicationIdRef.current && !submittedRef.current) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
        fetch(`${BACKEND}/applications/${applicationIdRef.current}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [])

  const requiredUploaded     = REQUIRED_DOC_KEYS.every(k => docStatus[k].status === 'success')
  const successCount         = DOC_TYPES.filter(d => docStatus[d.key].status === 'success').length
  const requiredCount        = REQUIRED_DOC_KEYS.filter(k => docStatus[k].status === 'success').length
  const missingRequiredCount = REQUIRED_DOC_KEYS.length - requiredCount

  const validateForm = () => {
    const errors = {}
    if (!form.gender)          errors.gender          = 'Please select your gender'
    if (!form.education_level) errors.education_level = 'Please select your education level'
    if (!form.field_of_study)  errors.field_of_study  = 'Please enter your field of study'
    if (!form.graduation_year) errors.graduation_year = 'Please enter your graduation year'
    if (!form.skills.trim())   errors.skills          = 'Please list at least one skill'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateDraft = async () => {
    if (submittingDraftRef.current) return
    submittingDraftRef.current = true
    if (!validateForm()) { submittingDraftRef.current = false; return }
    setSubmitting(true)
    try {
      const { data } = await api.post('/applications', {
        job_id:           parseInt(jobId),
        gender:           form.gender,
        education_level:  form.education_level,
        field_of_study:   form.field_of_study,
        graduation_year:  parseInt(form.graduation_year),
        experience_years: parseInt(form.experience_years) || 0,
        skills:           form.skills,
        certifications:   form.certifications || null,
        address:          form.address        || null,
        phone:            form.phone          || null,
        date_of_birth:    form.date_of_birth  || null,
      })
      if (data.submitted_at) { if (mountedRef.current) setAlreadyApplied(true); return }
      if (mountedRef.current) { setApplicationId(data.id); setStep(2) }
    } catch (err) {
      const { message } = extractErrorDetail(err)
      if (err.response?.status === 400 && message?.toLowerCase().includes('already applied')) {
        if (mountedRef.current) setAlreadyApplied(true); return
      }
      toast.error(message, { duration: 8000 })
    } finally {
      submittingDraftRef.current = false
      if (mountedRef.current) setSubmitting(false)
    }
  }

  const handleFileChange = async (docType, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const errMsg = `"${file.name}" is not a supported file type. Please upload a PDF, PNG, JPG, or JPEG.`
      toast.error(errMsg, { duration: 7000, icon: '📎' })
      setDocStatus(prev => ({
        ...prev,
        [docType]: { ..._blankDocState, status: 'error', message: errMsg, fileName: file.name, isRejected: false },
      }))
      return
    }

    if (file.size > MAX_FILE_SIZE_B) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      const errMsg = `This file is ${sizeMB} MB — the maximum allowed size is ${MAX_FILE_SIZE_MB} MB. Please compress or re-scan the document.`
      toast.error(errMsg, { duration: 7000})
      setDocStatus(prev => ({
        ...prev,
        [docType]: { ..._blankDocState, status: 'error', message: errMsg, fileName: file.name, isRejected: false },
      }))
      return
    }

    const isPdf      = ext === '.pdf'
    const previewUrl = isPdf ? null : createPreviewUrl(file)
    const pdfUrl     = isPdf ? createPdfUrl(file) : null

    if (previewUrlsRef.current[docType]) { try { URL.revokeObjectURL(previewUrlsRef.current[docType]) } catch {} }
    if (pdfUrlsRef.current[docType])     { try { URL.revokeObjectURL(pdfUrlsRef.current[docType]) } catch {} }
    previewUrlsRef.current[docType] = previewUrl
    pdfUrlsRef.current[docType]     = pdfUrl

    setDocStatus(prev => ({
      ...prev,
      [docType]: {
        ..._blankDocState, status: 'checking', message: 'Checking if we can read your document…',
        fileName: file.name, previewUrl, pdfUrl, isPdf,
      },
    }))

    const quality = await checkDocumentQuality(file)
    if (!mountedRef.current) return

    if (quality.hardReject) {
      toast.error('We couldn\'t read this document. Please upload a clearer version.', { duration: 8000 })
      setDocStatus(prev => ({
        ...prev,
        [docType]: {
          ..._blankDocState, status: 'rejected_quality', message: quality.reason,
          fileName: file.name, previewUrl, pdfUrl, isPdf, isRejected: true,
        },
      }))
      return
    }

    const qualityWarnings = quality.warnings || []
    handleUpload(docType, file, { previewUrl, pdfUrl, isPdf, qualityWarnings })
  }

  const handleUpload = useCallback(async (docType, file, opts = {}) => {
    const appId = applicationIdRef.current
    if (!appId) { toast.error('Please complete your details first before uploading documents.'); return }
    if (!opts._bypassUploadingGuard && uploadingRef.current.has(docType)) return
    uploadingRef.current.add(docType)

    const previewUrl      = opts.previewUrl      ?? null
    const pdfUrl          = opts.pdfUrl          ?? null
    const isPdf           = opts.isPdf           ?? false
    const qualityWarnings = opts.qualityWarnings ?? []

    if (mountedRef.current) {
      setDocStatus(prev => ({
        ...prev,
        [docType]: {
          ..._blankDocState, status: 'uploading', message: 'Uploading your document…',
          fileName: file.name, previewUrl, pdfUrl, isPdf, qualityWarnings,
        },
      }))
    }

    await getCurrentWakeGate()
    await waitForUploadSlot()
    if (!mountedRef.current) { releaseUploadSlot(); uploadingRef.current.delete(docType); return }

    setDocStatus(prev => ({
      ...prev,
      [docType]: {
        ..._blankDocState, status: 'uploading', message: 'Uploading your document…',
        fileName: file.name, previewUrl, pdfUrl, isPdf, qualityWarnings,
      },
    }))

    let slotReleased = false
    const releaseOnce = () => { if (!slotReleased) { slotReleased = true; releaseUploadSlot() } }

    // FIXED: Upload hint messages — plain English
    const hint1Timer = setTimeout(() => {
      if (!mountedRef.current) return
      setDocStatus(prev => { if (prev[docType]?.status !== 'uploading') return prev; return { ...prev, [docType]: { ...prev[docType], message: 'Saving your document…' } } })
    }, 5_000)
    const hint2Timer = setTimeout(() => {
      if (!mountedRef.current) return
      setDocStatus(prev => { if (prev[docType]?.status !== 'uploading') return prev; return { ...prev, [docType]: { ...prev[docType], message: 'Verifying your document — this can take up to 30 seconds…' } } })
    }, 20_000)
    const hint3Timer = setTimeout(() => {
      if (!mountedRef.current) return
      setDocStatus(prev => { if (prev[docType]?.status !== 'uploading') return prev; return { ...prev, [docType]: { ...prev[docType], message: 'Almost done — finishing up…' } } })
    }, 32_000)
    const clearHints = () => { clearTimeout(hint1Timer); clearTimeout(hint2Timer); clearTimeout(hint3Timer) }

    try {
      const existingId = uploadedDocIds.current[docType]
      if (existingId) {
        try { await api.delete(`/applications/${appId}/documents/${existingId}`) } catch { /* gone */ }
        delete uploadedDocIds.current[docType]
      }

      const formData = new FormData()
      formData.append('doc_type', docType)
      formData.append('file', file)

      const { data } = await api.post(`/applications/${appId}/documents`, formData, { _slotPreacquired: true })
      if (data.id) uploadedDocIds.current[docType] = data.id
      if (retryQueueRef.current[docType]) { delete retryQueueRef.current[docType]; if (mountedRef.current) syncQueuedCount() }

      const msg                = data.validation_message || '✓ Document uploaded successfully.'
      const isAdvisory         = _isAdvisory(msg)
      const isNameAdvisory     = _isNameAdvisory(msg)
      const isNameMismatch     = _isNameMismatch(msg)
      const isIdentityRejection = _isIdentityRejection(msg)

      if (mountedRef.current) {
        setDocStatus(prev => ({
          ...prev,
          [docType]: {
            ..._blankDocState, status: 'success', message: msg, fileName: file.name,
            isAdvisory, isNameAdvisory, isNameMismatch, isIdentityRejection,
            previewUrl, pdfUrl, isPdf, qualityWarnings,
          },
        }))
        const label = DOC_TYPES.find(d => d.key === docType)?.label
        toast.success(`${label} uploaded ✓`)
      }

    } catch (err) {
      const { message, isNetwork, isRejected, isIdentityRejection } = extractErrorDetail(err)
      const isDuplicate = err.response?.status === 400 && message?.toLowerCase().includes('already been uploaded')

      if (isDuplicate) {
        try {
          const { data: listData } = await api.get(`/applications/${appId}/documents`)
          const existing = listData.documents?.find(d => d.doc_type === docType)
          if (existing?.id) {
            uploadedDocIds.current[docType] = existing.id
            delete retryQueueRef.current[docType]
            if (mountedRef.current) {
              syncQueuedCount()
              setDocStatus(prev => ({
                ...prev,
                [docType]: {
                  ..._blankDocState, status: 'success', message: '✓ Document already uploaded.',
                  fileName: existing.original_name || file.name, previewUrl, pdfUrl, isPdf, qualityWarnings,
                },
              }))
              toast.success(`${DOC_TYPES.find(d => d.key === docType)?.label} confirmed ✓`)
            }
            return
          }
        } catch { /* fall through */ }
      }

      if (isNetwork) {
        window.dispatchEvent(new Event('wb:upload-failed'))
        retryQueueRef.current[docType] = file
        if (mountedRef.current) {
          syncQueuedCount()
          setDocStatus(prev => ({
            ...prev,
            [docType]: {
              ..._blankDocState, status: 'queued',
              message: 'You\'re offline or the server is starting up — your file will upload automatically when the connection is restored.',
              fileName: file.name, isNetwork: true, previewUrl, pdfUrl, isPdf, qualityWarnings,
            },
          }))
        }
        return
      }

      // FIXED: Hard reject (422) — identity rejection shows card, others show plain message
      if (mountedRef.current) {
        const newStatus = isIdentityRejection ? 'rejected_identity' : 'error'
        setDocStatus(prev => ({
          ...prev,
          [docType]: {
            ..._blankDocState, status: newStatus, message, fileName: file.name,
            isIdentityRejection, isRejected: true,
            previewUrl, pdfUrl, isPdf, qualityWarnings,
          },
        }))
        if (isIdentityRejection) {
          // FIXED: Friendly toast — no technical jargon
          toast.error(
            `We couldn't confirm this ${DOC_TYPES.find(d => d.key === docType)?.label.toLowerCase() || 'document'} belongs to you. Please upload your own.`,
            { duration: 12000 }
          )
        } else if (isRejected) {
          toast.error(message, { duration: 10000})
        } else {
          toast.error(`Upload failed — ${message}`, { duration: 8000 })
        }
      }

    } finally {
      clearHints()
      uploadingRef.current.delete(docType)
      releaseOnce()
    }
  }, [syncQueuedCount])

  useEffect(() => { handleUploadRef.current = handleUpload }, [handleUpload])

  const handleAttachFromProfile = useCallback(async (docType) => {
    const appId = applicationIdRef.current
    if (!appId) { toast.error('Please complete your details first.'); return }
    const entry = profileAvailable[docType]
    if (!entry) return
    setAttachingProfile(prev => ({ ...prev, [docType]: true }))
    setDocStatus(prev => ({
      ...prev,
      [docType]: {
        ..._blankDocState, status: 'uploading', message: 'Attaching document from your profile…',
        fileName: entry.fileName, fromProfile: true,
      },
    }))
    try {
      const { data } = await api.post(
        `/applications/${appId}/documents/attach-profile`,
        { profile_doc_id: entry.id, doc_type: docType, source: entry.source || 'profile' }
      )
      if (!data?.id) throw new Error('No document id returned')
      uploadedDocIds.current[docType] = data.id
      const msg                = data.validation_message || '✓ Attached from profile.'
      const isAdvisory         = _isAdvisory(msg)
      const isNameAdvisory     = _isNameAdvisory(msg)
      const isNameMismatch     = _isNameMismatch(msg)
      const isIdentityRejection = _isIdentityRejection(msg)
      if (mountedRef.current) {
        setDocStatus(prev => ({
          ...prev,
          [docType]: {
            ..._blankDocState, status: 'success', message: msg, fileName: entry.fileName,
            isAdvisory, isNameAdvisory, isNameMismatch, isIdentityRejection, fromProfile: true,
          },
        }))
        toast.success(`${DOC_TYPES.find(d => d.key === docType)?.label} attached from profile ✓`)
      }
    } catch (err) {
      const { message, isIdentityRejection } = extractErrorDetail(err)
      console.warn(`[ApplyPage] attach-profile failed for '${docType}': ${message}`)
      if (mountedRef.current) {
        if (isIdentityRejection) {
          setDocStatus(prev => ({
            ...prev,
            [docType]: {
              ..._blankDocState, status: 'rejected_identity', message,
              fileName: entry.fileName, isIdentityRejection: true, isRejected: true, fromProfile: true,
            },
          }))
          toast.error(
            `The ${DOC_TYPES.find(d => d.key === docType)?.label.toLowerCase() || 'document'} saved in your profile doesn't appear to match your name. Please upload a new one.`,
            { duration: 10000}
          )
        } else {
          setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
          delete uploadedDocIds.current[docType]
          toast.error(
            `Couldn't attach your saved ${DOC_TYPES.find(d => d.key === docType)?.label.toLowerCase() || 'document'} — please upload the file manually.`,
            { duration: 7000}
          )
        }
      }
    } finally {
      if (mountedRef.current) setAttachingProfile(prev => ({ ...prev, [docType]: false }))
    }
  }, [profileAvailable])

  const handleManualRetry = (docType) => {
    const file = retryQueueRef.current[docType]
    if (!file) return
    delete retryQueueRef.current[docType]
    syncQueuedCount()
    uploadingRef.current.delete(docType)
    const s = docStatus[docType]
    handleUpload(docType, file, { _bypassUploadingGuard: true, _skipQualityCheck: true, previewUrl: s.previewUrl, pdfUrl: s.pdfUrl, isPdf: s.isPdf, qualityWarnings: s.qualityWarnings })
  }

  const handleCancelQueue = (docType) => {
    delete retryQueueRef.current[docType]
    syncQueuedCount()
    uploadingRef.current.delete(docType)
    if (previewUrlsRef.current[docType]) { try { URL.revokeObjectURL(previewUrlsRef.current[docType]) } catch {}; delete previewUrlsRef.current[docType] }
    if (pdfUrlsRef.current[docType])     { try { URL.revokeObjectURL(pdfUrlsRef.current[docType]) } catch {};     delete pdfUrlsRef.current[docType] }
    setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
  }

  const handleDeleteDoc = useCallback(async (docType) => {
    if (uploadingRef.current.has(docType)) {
      toast.error('This document is still uploading — please wait.')
      return
    }

    if (retryQueueRef.current[docType]) {
      delete retryQueueRef.current[docType]
      syncQueuedCount()
    }

    if (previewUrlsRef.current[docType]) {
      try { URL.revokeObjectURL(previewUrlsRef.current[docType]) } catch {}
      delete previewUrlsRef.current[docType]
    }
    if (pdfUrlsRef.current[docType]) {
      try { URL.revokeObjectURL(pdfUrlsRef.current[docType]) } catch {}
      delete pdfUrlsRef.current[docType]
    }

    const appId = applicationIdRef.current
    if (!appId) {
      if (mountedRef.current) {
        setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
      }
      return
    }

    let docId = uploadedDocIds.current[docType] ?? null

    if (!docId) {
      try {
        const { data } = await api.get(`/applications/${appId}/documents`)
        const found = data.documents?.find(d => d.doc_type === docType)
        docId = found?.id ?? null
      } catch {
        if (mountedRef.current) {
          setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
          toast.success('Document removed.')
        }
        return
      }
    }

    if (!docId) {
      if (mountedRef.current) {
        setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
        toast.success('Document removed.')
      }
      return
    }

    try {
      await api.delete(`/applications/${appId}/documents/${docId}`)
      delete uploadedDocIds.current[docType]
      if (mountedRef.current) {
        setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
        toast.success('Document removed.')
      }
    } catch (err) {
      const { isNotFound } = extractErrorDetail(err)
      if (isNotFound) {
        delete uploadedDocIds.current[docType]
        if (mountedRef.current) {
          setDocStatus(prev => ({ ...prev, [docType]: { ..._blankDocState } }))
          toast.success('Document removed.')
        }
        return
      }
      if (mountedRef.current) {
        toast.error('Couldn\'t remove this document — please try again.')
      }
    }
  }, [syncQueuedCount])

  const handleFinalize = async () => {
    if (!requiredUploaded) { toast.error('Please upload all 3 required documents before submitting.'); return }
    setSubmitting(true)
    try {
      await api.post(`/applications/${applicationId}/finalize`)
      submittedRef.current = true
      if (mountedRef.current) setSubmitted(true)
    } catch (err) {
      const { message } = extractErrorDetail(err)
      toast.error(message, { duration: 8000 })
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Loading / guard states
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingJob) return (
    <div className="page-wrapper"><Navbar />
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    </div>
  )

  if (!job) return (
    <div className="page-wrapper"><Navbar />
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
        <h2 style={{ color: '#111827' }}>Position not found</h2>
        <button style={{ marginTop: 20, padding: '10px 22px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/jobs')}>Browse Positions</button>
      </div>
    </div>
  )

  if (alreadyApplied) return <AlreadyAppliedScreen job={job} navigate={navigate} />

  if (submitted) return (
    <div className="page-wrapper">
      <Helmet><title>Application Submitted — Shortlisting AI</title></Helmet>
      <Navbar />
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '40px 0 36px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', border: '3px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <CheckCircle size={40} color="#16a34a" />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', marginBottom: 14 }}>Application Submitted!</h1>
        <div style={{ width: 44, height: 3, background: '#2563eb', borderRadius: 99, margin: '0 auto 20px' }} />
        <p style={{ color: '#6b7280', maxWidth: 520, lineHeight: 1.8, marginBottom: 20 }}>
          Your application for <strong style={{ color: '#111827' }}>{job.title}</strong> has been submitted successfully.
        </p>
        <div style={{ maxWidth: 520, width: '100%', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '18px 22px', marginBottom: 20, textAlign: 'left' }}>
          <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 10, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 7 }}>
            <ShieldCheck size={15} /> What happens next
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: '#1e40af', fontSize: '.85rem', lineHeight: 2 }}>
            <li>Your documents are <strong>verified automatically</strong> — no action needed from you.</li>
            <li>Your <strong>profile will be updated</strong> with information from your documents.</li>
            <li>Shortlisted candidates will be contacted directly.</li>
          </ol>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/jobs')} style={{ padding: '10px 22px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Browse More Positions</button>
          <button onClick={() => navigate('/applicant')} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>My Applications</button>
        </div>
      </div>
    </div>
  )

  const profileHintCount = Object.keys(profileAvailable).length
  const accountName = user?.full_name || user?.fullName || ''

  return (
    <>
      <Helmet><title>Apply — {job.title} | Shortlisting AI</title></Helmet>
      <div className="page-wrapper">
        <Navbar />
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '36px 20px 30px', color: '#ffffff' }}>
          <div className="container">
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#93c5fd', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Applying for</div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#ffffff' }}>{job.title}</h1>
          </div>
        </div>

        <div style={{ background: '#f9fafb', padding: '36px 20px' }}>
          <div className="container" style={{ maxWidth: 740 }}>
            <StepBar current={step} />

            {/* ══ STEP 0 ══ */}
            {step === 0 && (
              <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 36px' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Step 1 of 4</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>About This Role</h2>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 20 }} />
                <p style={{ color: '#4b5563', fontSize: '1rem', lineHeight: 1.8, marginBottom: 24 }}>{job.description || 'Review the role details before applying.'}</p>
                {job.required_skills && (
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#374151', marginBottom: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>Required Skills</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {job.required_skills.split(',').map(s => (
                        <span key={s} style={{ padding: '4px 12px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', fontSize: '.78rem', fontWeight: 600, border: '1px solid #bfdbfe' }}>{s.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                {profileHintCount > 0 && (
                  <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 20, fontSize: '.88rem', color: '#14532d', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <User size={14} color="#16a34a" />
                    <span><strong>{profileHintCount} document{profileHintCount > 1 ? 's' : ''} saved in your profile.</strong>{' '}You can reuse them in the upload step, or upload fresh files.</span>
                  </div>
                )}
                <div style={{ padding: '16px 20px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 30, fontSize: '.88rem', color: '#78350f', lineHeight: 1.7 }}>
                  <strong>How this works:</strong><br />
                  <strong>Step 1:</strong> Fill in your details (education, skills, experience)<br />
                  <strong>Step 2:</strong> Upload your documents — each is verified instantly<br />
                  <strong>Step 3:</strong> Submit — your application is evaluated automatically<br />
                  <strong>Required documents (3):</strong> National ID, CV, Diploma<br />
                  <strong>Optional documents (2):</strong> Professional Certificate, Experience Letter<br />
                  <strong>Accepted formats:</strong> PDF, PNG, JPG, JPEG (max {MAX_FILE_SIZE_MB} MB each)<br />
                  <strong>Identity check:</strong> Your name is verified on every document you upload. Documents belonging to someone else will be rejected.<br />
                  <strong>Tip:</strong> Use clear, well-lit photos or PDF scans for fastest processing
                </div>
                <button onClick={() => setStep(1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 24px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, cursor: 'pointer', fontSize: '.9rem' }}>
                  Begin Application <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* ══ STEP 1 ══ */}
            {step === 1 && (
              <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 36px' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Step 2 of 4</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>Your Details</h2>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 24 }} />
                <div style={{ padding: '12px 16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, marginBottom: 22, fontSize: '.85rem', color: '#0369a1', display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.6 }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>Fill in your details accurately. After you submit, verified information from your documents will <strong>automatically update your profile</strong>.</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={fieldLabel}>Gender <span style={{ color: '#dc2626' }}>*</span></label>
                    <select className="form-select" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={{ borderColor: formErrors.gender ? '#dc2626' : undefined }}>
                      <option value="">Select…</option>
                      <option>Male</option><option>Female</option><option>Other / Prefer not to say</option>
                    </select>
                    {formErrors.gender && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.gender}</div>}
                  </div>
                  <div>
                    <label style={fieldLabel}>Highest Education Level <span style={{ color: '#dc2626' }}>*</span></label>
                    <select className="form-select" value={form.education_level} onChange={e => setForm(f => ({ ...f, education_level: e.target.value }))} style={{ borderColor: formErrors.education_level ? '#dc2626' : undefined }}>
                      <option value="">Select…</option>
                      <option>Diploma</option><option>Bachelor's</option><option>Master's</option><option>PhD</option>
                    </select>
                    {formErrors.education_level && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.education_level}</div>}
                  </div>
                  <div>
                    <label style={fieldLabel}>Field of Study <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="form-input" type="text" placeholder="e.g. Computer Science, Nursing, Accounting…" value={form.field_of_study} onChange={e => setForm(f => ({ ...f, field_of_study: e.target.value }))} style={{ borderColor: formErrors.field_of_study ? '#dc2626' : undefined }} />
                    {formErrors.field_of_study && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.field_of_study}</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={fieldLabel}>Graduation Year <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="form-input" type="number" min="1980" max={new Date().getFullYear()} placeholder="e.g. 2022" value={form.graduation_year} onChange={e => setForm(f => ({ ...f, graduation_year: e.target.value }))} style={{ borderColor: formErrors.graduation_year ? '#dc2626' : undefined }} />
                      {formErrors.graduation_year && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.graduation_year}</div>}
                    </div>
                    <div>
                      <label style={fieldLabel}>Years of Experience</label>
                      <input className="form-input" type="number" min="0" max="50" value={form.experience_years} onChange={e => setForm(f => ({ ...f, experience_years: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={fieldLabel}>Skills <span style={{ color: '#dc2626' }}>*</span></label>
                    <textarea className="form-input form-textarea" placeholder="e.g. Python, SQL, Data Analysis (comma-separated)" value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} style={{ borderColor: formErrors.skills ? '#dc2626' : undefined }} />
                    {formErrors.skills && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.skills}</div>}
                  </div>
                  <div>
                    <label style={fieldLabel}>Certifications <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af', fontSize: '.75rem', letterSpacing: 0 }}>(optional)</span></label>
                    <textarea className="form-input form-textarea" placeholder="e.g. AWS Certified, PMP, CCNA" value={form.certifications} onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))} />
                  </div>
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 18 }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                      Personal Info <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '.75rem' }}>(optional — auto-filled from your documents after submission)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={fieldLabel}>Phone</label>
                        <input className="form-input" type="tel" placeholder="e.g. +250 7XX XXX XXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                      </div>
                      <div>
                        <label style={fieldLabel}>Date of Birth</label>
                        <input className="form-input" type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <label style={fieldLabel}>Address / Location</label>
                      <input className="form-input" type="text" placeholder="e.g. Kigali, Rwanda" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                  <button onClick={() => setStep(0)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '.9rem' }}>
                    <ArrowLeft size={13} /> Back
                  </button>
                  <button onClick={handleCreateDraft} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 6, border: 'none', background: submitting ? '#93c5fd' : '#2563eb', color: '#ffffff', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '.9rem' }}>
                    {submitting ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <>Continue to Documents <ArrowRight size={13} /></>}
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 2 — Documents ══ */}
            {step === 2 && (
              <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 36px' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Step 3 of 4</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>Upload Documents</h2>
                  <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: '.78rem', fontWeight: 700, background: requiredUploaded ? '#dcfce7' : '#fef3c7', border: `1.5px solid ${requiredUploaded ? '#16a34a' : '#d97706'}`, color: requiredUploaded ? '#14532d' : '#78350f' }}>
                    {requiredCount} / {REQUIRED_DOC_KEYS.length} required
                  </span>
                </div>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 18 }} />

                <p style={{ color: '#4b5563', fontSize: '.92rem', lineHeight: 1.75, marginBottom: 8 }}>
                  Upload your <strong style={{ color: '#111827' }}>3 required documents</strong>. Your name on ALL documents must match your account name: <strong style={{ color: '#2563eb' }}>{accountName}</strong>
                </p>

                <div style={{ padding: '10px 14px', background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 6, marginBottom: 16, fontSize: '.82rem', color: '#7f1d1d', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <ShieldX size={13} style={{ flexShrink: 0, marginTop: 1 }} color="#dc2626" />
                  <span>
                    <strong>Every document is checked to confirm it belongs to you.</strong> Only upload documents that show your name: <strong>{accountName}</strong>. Documents belonging to someone else will be rejected.
                  </span>
                </div>

                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, marginBottom: 16, fontSize: '.82rem', color: '#14532d', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <ShieldCheck size={13} style={{ flexShrink: 0, marginTop: 1 }} color="#16a34a" />
                  <span>
                    <strong>Documents are checked automatically as you upload them.</strong> We verify readability, document type, and that your name is present — so you'll know right away if something needs fixing.
                  </span>
                </div>

                <WakeBanner status={serverStatus} queuedCount={queuedCount} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
                  {DOC_TYPES.map(doc => {
                    const state              = docStatus[doc.key]
                    const isSuccess          = state.status === 'success'
                    const isError            = state.status === 'error'
                    const isLoading          = state.status === 'uploading'
                    const isChecking         = state.status === 'checking'
                    const isQueued           = state.status === 'queued'
                    const isPending          = state.status === 'pending'
                    const isQualityRejected  = state.status === 'rejected_quality'
                    const isIdentityRejected = state.status === 'rejected_identity'
                    const isAdvisory         = isSuccess && state.isAdvisory
                    const isNameAdvisory     = isSuccess && state.isNameAdvisory
                    const isNameMismatch     = isSuccess && state.isNameMismatch
                    const isFromProf         = isSuccess && state.fromProfile
                    const isRejected         = isError && state.isRejected

                    const hasProfileHint = !!profileAvailable[doc.key]
                    const showProfileBtn = hasProfileHint && (state.status === 'idle' || state.status === 'error' || state.status === 'rejected_quality' || state.status === 'rejected_identity') && !attachingProfile[doc.key]
                    const isAttaching    = attachingProfile[doc.key]

                    const borderColor = isIdentityRejected                                              ? '#dc2626'
                      : isFromProf                                                                      ? '#16a34a'
                      : isSuccess && !isAdvisory && !isNameAdvisory && !isNameMismatch                 ? '#16a34a'
                      : isAdvisory                                                                      ? '#93c5fd'
                      : isNameMismatch                                                                  ? '#fcd34d'
                      : isNameAdvisory                                                                  ? '#fcd34d'
                      : isQueued                                                                        ? '#60a5fa'
                      : isPending                                                                       ? '#a5b4fc'
                      : isLoading || isChecking                                                         ? '#60a5fa'
                      : isAttaching                                                                     ? '#60a5fa'
                      : isQualityRejected                                                               ? '#dc2626'
                      : isRejected                                                                      ? '#dc2626'
                      : isError                                                                         ? '#f97316'
                      :                                                                                   '#e5e7eb'

                    const bgColor = isIdentityRejected                                                  ? '#fef2f2'
                      : isFromProf                                                                      ? '#f0fdf4'
                      : isSuccess && !isAdvisory && !isNameAdvisory && !isNameMismatch                 ? '#f0fdf4'
                      : isAdvisory                                                                      ? '#eff6ff'
                      : isNameMismatch                                                                  ? '#fffbeb'
                      : isNameAdvisory                                                                  ? '#fffbeb'
                      : isQueued                                                                        ? '#eff6ff'
                      : isPending                                                                       ? '#f5f3ff'
                      : isLoading || isChecking                                                         ? '#f0f9ff'
                      : isAttaching                                                                     ? '#f0f9ff'
                      : isQualityRejected                                                               ? '#fef2f2'
                      : isRejected                                                                      ? '#fff1f2'
                      : isError                                                                         ? '#fff7ed'
                      :                                                                                   '#f9fafb'

                    return (
                      <div key={doc.key} style={{ padding: '18px 20px', border: `${isIdentityRejected ? '2px' : '1.5px'} solid ${borderColor}`, borderRadius: 10, background: bgColor, transition: 'all .2s' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0, border: '1px solid #e5e7eb' }}>
                            {doc.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#111827', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {doc.label}
                              {doc.required
                                ? <span style={{ color: '#dc2626', fontSize: '.8rem' }}>*</span>
                                : <span style={{ color: '#9ca3af', fontSize: '.78rem', fontWeight: 400 }}>(optional)</span>}
                              {isFromProf && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.68rem', fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 7px' }}>
                                  <User size={9} /> From profile
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '.8rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 8 }}>{doc.description}</div>

                            <DocPreview previewUrl={state.previewUrl} isPdf={state.isPdf} fileName={state.fileName} pdfUrl={state.pdfUrl} />

                            {(isLoading || isSuccess || isChecking) && state.qualityWarnings?.length > 0 && (
                              <QualityWarningCard warnings={state.qualityWarnings} />
                            )}

                            {showProfileBtn && (
                              <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.8rem', color: '#14532d', fontWeight: 600 }}>
                                  <User size={12} color="#16a34a" />
                                  <span>Saved in your profile: <em>{profileAvailable[doc.key].fileName}</em></span>
                                </div>
                                <button onClick={() => handleAttachFromProfile(doc.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  <CheckCircle size={11} /> Use this file
                                </button>
                              </div>
                            )}

                            {isAttaching && (
                              <div style={{ marginBottom: 10, padding: '8px 12px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 7, fontSize: '.8rem', color: '#1e40af', fontWeight: 600 }}>
                                <div className="spinner" style={{ width: 13, height: 13, borderTopColor: '#2563eb', flexShrink: 0 }} />
                                Attaching document from your profile…
                              </div>
                            )}

                            {/* FIXED: IdentityRejectionCard no longer receives raw message */}
                            {isIdentityRejected && (
                              <IdentityRejectionCard docType={doc.key} accountName={accountName} />
                            )}

                            {isQualityRejected && (
                              <QualityRejectionCard reason={state.message} docTips={doc.tips} extraTips={doc.qualityTips} />
                            )}

                            {isSuccess && state.message && !isNameAdvisory && !isNameMismatch && (
                              <div style={{
                                fontSize: '.78rem', lineHeight: 1.5, marginBottom: 10,
                                padding: '8px 12px', borderRadius: 6,
                                background: isAdvisory ? '#dbeafe' : '#dcfce7',
                                color:      isAdvisory ? '#1e40af' : '#14532d',
                                border:    `1px solid ${isAdvisory ? '#93c5fd' : '#86efac'}`,
                                display: 'flex', alignItems: 'flex-start', gap: 6,
                              }}>
                                <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>{isAdvisory ? ADVISORY_USER_MESSAGE : state.message}</span>
                              </div>
                            )}

                            {isSuccess && isNameMismatch && (
                              <>
                                <div style={{ fontSize: '.78rem', lineHeight: 1.5, marginBottom: 6, padding: '8px 12px', borderRadius: 6, background: '#dcfce7', color: '#14532d', border: '1px solid #86efac', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span>Document accepted.</span>
                                </div>
                                <NameMismatchCard message={state.message} />
                              </>
                            )}

                            {isSuccess && isNameAdvisory && (
                              <>
                                <div style={{ fontSize: '.78rem', lineHeight: 1.5, marginBottom: 6, padding: '8px 12px', borderRadius: 6, background: '#dcfce7', color: '#14532d', border: '1px solid #86efac', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span>Document accepted.</span>
                                </div>
                                <NameAdvisoryCard message={state.message} docType={doc.key} />
                              </>
                            )}

                            {isChecking && (
                              <div style={{ fontSize: '.82rem', lineHeight: 1.6, marginBottom: 10, padding: '10px 14px', borderRadius: 6, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '.83rem' }}>
                                  <div className="spinner" style={{ width: 13, height: 13, borderTopColor: '#2563eb', flexShrink: 0 }} />
                                  Checking if we can read your document…
                                </div>
                              </div>
                            )}

                            {isLoading && (
                              <div style={{ fontSize: '.82rem', lineHeight: 1.6, marginBottom: 10, padding: '10px 14px', borderRadius: 6, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4, fontSize: '.83rem' }}>
                                  <div className="spinner" style={{ width: 13, height: 13, borderTopColor: '#2563eb', flexShrink: 0 }} />
                                  {state.message || 'Uploading your document…'}
                                </div>
                                <div style={{ paddingLeft: 19, fontSize: '.78rem', color: '#3b82f6' }}>Please wait — do not close this page.</div>
                              </div>
                            )}

                            {isQueued && (
                              <div style={{ fontSize: '.82rem', lineHeight: 1.6, marginBottom: 10, padding: '10px 14px', borderRadius: 6, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4, fontSize: '.83rem' }}>
                                  <RefreshCw size={13} style={{ flexShrink: 0, animation: 'spin 2s linear infinite' }} />
                                  Waiting to upload — server is starting up
                                </div>
                                <div style={{ paddingLeft: 19 }}>Your file is saved and will upload automatically once the server is ready.</div>
                              </div>
                            )}

                            {isError && !isQualityRejected && !isIdentityRejected && state.message && (
                              <div style={{ fontSize: '.82rem', lineHeight: 1.6, marginBottom: 10, padding: '10px 14px', borderRadius: 6, background: isRejected ? '#fee2e2' : '#fff7ed', color: isRejected ? '#7f1d1d' : '#7c2d12', border: `1px solid ${isRejected ? '#fca5a5' : '#fdba74'}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4, fontSize: '.83rem' }}>
                                  <XCircle size={13} style={{ flexShrink: 0 }} />
                                  {isRejected ? 'This document was rejected' : 'Upload failed'}
                                </div>
                                <div style={{ paddingLeft: 19 }}>{state.message}</div>
                                {isRejected && <div style={{ paddingLeft: 19, marginTop: 6, fontSize: '.78rem', color: '#991b1b', fontWeight: 600 }}>Please upload the correct document for this slot.</div>}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              {isPending ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6d28d9', fontSize: '.85rem' }}>
                                  <div className="spinner" style={{ width: 14, height: 14, borderTopColor: '#6d28d9' }} /> {state.fileName} — waiting…
                                </div>
                              ) : isChecking ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb', fontSize: '.85rem', fontWeight: 600 }}>
                                  <div className="spinner" style={{ width: 14, height: 14, borderTopColor: '#2563eb' }} /> {state.fileName}
                                </div>
                              ) : isLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb', fontSize: '.85rem', fontWeight: 600 }}>
                                  <div className="spinner" style={{ width: 14, height: 14, borderTopColor: '#2563eb' }} /> {state.fileName}
                                </div>
                              ) : isQueued ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#2563eb', fontSize: '.85rem', fontWeight: 600 }}>
                                    <RefreshCw size={13} style={{ animation: 'spin 2s linear infinite' }} /> {state.fileName} — queued
                                  </div>
                                  <button onClick={() => handleManualRetry(doc.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '.78rem', textDecoration: 'underline', padding: 0 }}>Retry now</button>
                                  <button onClick={() => handleCancelQueue(doc.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '.78rem', textDecoration: 'underline', padding: 0 }}>Cancel</button>
                                </div>
                              ) : isSuccess ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.85rem', fontWeight: 600, color: isAdvisory ? '#1d4ed8' : (isNameAdvisory || isNameMismatch) ? '#78350f' : '#15803d' }}>
                                    <CheckCircle size={13} /> {state.fileName}
                                  </div>
                                  <button onClick={() => handleDeleteDoc(doc.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '.78rem', textDecoration: 'underline', padding: 0 }}>
                                    {isFromProf ? 'Remove & upload a different file' : 'Remove & re-upload'}
                                  </button>
                                </div>
                              ) : (
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: 'none', background: (isQualityRejected || isIdentityRejected || isRejected) ? '#dc2626' : isError ? '#f97316' : '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>
                                  <Upload size={13} />
                                  {isIdentityRejected ? `Upload my own ${doc.label.toLowerCase()}`
                                    : isQualityRejected ? 'Upload a clearer version'
                                    : isRejected ? 'Upload the correct file'
                                    : isError ? 'Try Again'
                                    : 'Choose File'}
                                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => handleFileChange(doc.key, e)} />
                                </label>
                              )}
                            </div>
                          </div>

                          {/* Top-right status icon */}
                          <div style={{ flexShrink: 0, marginTop: 4 }}>
                            {isSuccess && !isAdvisory && !isNameAdvisory && !isNameMismatch && <CheckCircle size={20} color="#16a34a" />}
                            {isAdvisory                && <CheckCircle size={20} color="#3b82f6" />}
                            {(isNameAdvisory || isNameMismatch) && <AlertCircle size={20} color="#d97706" />}
                            {isQueued                  && <RefreshCw   size={20} color="#2563eb" style={{ animation: 'spin 2s linear infinite' }} />}
                            {isIdentityRejected        && <ShieldX     size={20} color="#dc2626" />}
                            {(isError || isQualityRejected) && !isIdentityRejected && <XCircle size={20} color="#dc2626" />}
                            {(isLoading || isChecking) && <div className="spinner" style={{ width: 20, height: 20, borderTopColor: '#2563eb' }} />}
                            {isPending                 && <div className="spinner" style={{ width: 20, height: 20, borderTopColor: '#6d28d9' }} />}
                            {!isSuccess && !isError && !isQualityRejected && !isIdentityRejected && !isLoading && !isChecking && !isPending && !isQueued && <AlertCircle size={20} color="#d1d5db" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {!requiredUploaded && (
                  <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: '.88rem', color: '#78350f', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <AlertCircle size={14} />
                    {missingRequiredCount === 1
                      ? 'Please upload the last required document before continuing.'
                      : `Please upload the remaining ${missingRequiredCount} required documents before continuing.`}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setStep(1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>
                    <ArrowLeft size={13} /> Back
                  </button>
                  <button onClick={() => setStep(3)} disabled={!requiredUploaded} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 6, border: 'none', background: requiredUploaded ? '#2563eb' : '#93c5fd', color: '#ffffff', fontWeight: 700, cursor: requiredUploaded ? 'pointer' : 'not-allowed', opacity: requiredUploaded ? 1 : 0.7 }}>
                    Continue to Submit <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 3 ══ */}
            {step === 3 && (
              <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 36px' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Step 4 of 4</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>Review &amp; Submit</h2>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 20 }} />
                <p style={{ color: '#4b5563', fontSize: '.92rem', marginBottom: 24 }}>Please review your application before final submission.</p>
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '18px 22px', marginBottom: 22, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14, color: '#374151' }}>Application Summary</div>
                  {[
                    ['Position',   job.title],
                    ['Applicant',  accountName],
                    ['Education',  form.education_level],
                    ['Field',      form.field_of_study],
                    ['Experience', `${form.experience_years || 0} year(s)`],
                    ['Skills',     form.skills],
                    ['Documents',  `${requiredCount}/${REQUIRED_DOC_KEYS.length} required${successCount > requiredCount ? ` + ${successCount - requiredCount} optional` : ''} ✅`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: '.9rem' }}>
                      <span style={{ color: '#6b7280', minWidth: 100, flexShrink: 0 }}>{label}:</span>
                      <span style={{ color: '#111827', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '14px 18px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 30, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <ShieldCheck size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: '.88rem', color: '#14532d', lineHeight: 1.7, fontWeight: 600 }}>
                    All required documents uploaded and verified. By submitting, you confirm that all documents are your own and the information provided is accurate.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setStep(2)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>
                    <ArrowLeft size={13} /> Back to Documents
                  </button>
                  <button onClick={handleFinalize} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 28px', borderRadius: 6, border: 'none', background: submitting ? '#93c5fd' : '#2563eb', color: '#ffffff', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', minWidth: 180, justifyContent: 'center' }}>
                    {submitting ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Submitting…</> : <>Submit Application <CheckCircle size={13} /></>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}